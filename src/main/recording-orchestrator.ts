import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { DemoLauncher } from './demo-launcher'
import { OBSService } from './obs-service'
import { writeLaunchCfg, writeGsiCfg } from './cfg-writer'
import { startGsiServer, stopGsiServer, resetGsiReady, waitForGsiReady } from './gsi-ready'
import { injectTimedSequence, findCs2Window } from './win-console-inject'
import { splitVideo, cleanupObsRecording } from './video-post-processor'
import { getFfmpegPath } from './ffmpeg'
import type {
  RecordingRequest,
  RecordingResult,
  RecordingClipResult,
  RecordingProgress,
  RecordingStatus,
  HighlightRecordingStatus
} from '../shared/recording-types'

const GSI_READY_TIMEOUT_MS = 30_000
const WINDOW_DETECT_TIMEOUT_MS = 30_000
const DEMO_SETTLE_MS = 8_000
const OBS_SCENE_NAME = 'CS2FragForge'
const OBS_SOURCE_NAME = 'CS2 Game Capture'
const BUFFER_SEC = 5

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class RecordingOrchestrator {
  private isCancelled = false
  private obsService: OBSService | null = null
  private demoLauncher: DemoLauncher | null = null
  private cfgDir: string | null = null
  private launchCfgPath: string | null = null
  private gsiCfgPath: string | null = null
  private copiedDemoPath: string | null = null
  private obsRecordingActive = false
  private cleanedUp = false

  constructor(private onProgress: (progress: RecordingProgress) => void) {}

  async record(request: RecordingRequest): Promise<RecordingResult> {
    if (request.highlights.length === 0) {
      throw new Error('No highlights to record')
    }

    this.isCancelled = false
    this.obsRecordingActive = false
    this.cleanedUp = false
    const clips: RecordingClipResult[] = []

    try {
      // ─── Step 1: Connect to OBS ───────────────────────────────────
      this.reportProgress('connecting-obs', 5, 0, request.highlights.length, 'preparing', 'Connecting to OBS...')
      this.obsService = new OBSService()
      try {
        await this.obsService.connect(request.obsConfig)
      } catch (err) {
        return { success: false, clips, error: (err as Error).message }
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 2: Configure OBS scene ──────────────────────────────
      this.reportProgress('configuring-obs', 10, 0, request.highlights.length, 'preparing', 'Configuring OBS scene...')
      try {
        await this.obsService.ensureScene(OBS_SCENE_NAME)
        await this.obsService.ensureGameCaptureSource(OBS_SCENE_NAME, OBS_SOURCE_NAME)
      } catch (err) {
        await this.obsService.disconnect()
        return { success: false, clips, error: (err as Error).message }
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 3: Prepare demo + launch CFG + GSI CFG ─────────────
      this.reportProgress('preparing', 12, 0, request.highlights.length, 'preparing', 'Preparing demo...')
      this.demoLauncher = new DemoLauncher(request.cs2Path)
      this.cfgDir = path.join(request.cs2Path, 'game', 'csgo', 'cfg')

      const stem = `_cs2ff_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

      await this.demoLauncher.copyDemoToCsgo(request.demoPath, stem)
      this.copiedDemoPath = path.join(request.cs2Path, 'game', 'csgo', `${stem}.dem`)

      // Start GSI server and write GSI config
      const gsiPort = await startGsiServer()
      const gsiUri = `http://127.0.0.1:${gsiPort}`
      resetGsiReady()

      this.gsiCfgPath = await writeGsiCfg(this.cfgDir, stem, gsiUri)
      console.log(`[Orchestrator] GSI config written, URI: ${gsiUri}`)

      this.launchCfgPath = await writeLaunchCfg(
        { demoStem: stem, fpsMax: 30 },
        this.cfgDir,
        stem
      )

      const outputDir = request.outputDir ?? path.join(path.dirname(request.demoPath), 'clips')
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 4: Launch CS2 ───────────────────────────────────────
      this.reportProgress('launching-cs2', 15, 0, request.highlights.length, 'launching', 'Launching CS2...')
      const launchTime = Date.now()
      try {
        await this.demoLauncher.launch(stem)
      } catch (err) {
        await this.obsService.disconnect()
        return { success: false, clips, error: (err as Error).message }
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 5: Wait for GSI to confirm CS2 is in-game ──────────
      this.reportProgress('waiting-load', 20, 0, request.highlights.length, 'loading', 'Waiting for CS2 to start...')
      console.log(`[Orchestrator] Waiting for GSI ready (timeout ${GSI_READY_TIMEOUT_MS / 1000}s)...`)
      const gsiOk = await waitForGsiReady(GSI_READY_TIMEOUT_MS)
      if (!gsiOk) {
        console.warn('[Orchestrator] GSI ready timed out — falling back to window detection')
        const windowFound = await this.waitForCs2Window()
        if (!windowFound) {
          console.warn('[Orchestrator] CS2 window not found — proceeding anyway')
        }
      } else {
        const elapsed = ((Date.now() - launchTime) / 1000).toFixed(1)
        console.log(`[Orchestrator] GSI confirmed in-game after ${elapsed}s`)
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 6: Wait for demo to stabilize ──────────────────────
      // Insight Agent: 8s after GSI ready. We use 8s.
      this.reportProgress('loading-demo', 25, 0, request.highlights.length, 'loading',
        `Waiting ${DEMO_SETTLE_MS / 1000}s for demo to stabilize...`)
      console.log(`[Orchestrator] Waiting ${DEMO_SETTLE_MS / 1000}s for demo to settle...`)
      await sleep(DEMO_SETTLE_MS)
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 7: Pause demo at load point ─────────────────────────
      this.reportProgress('preparing-record', 28, 0, request.highlights.length, 'preparing', 'Pausing demo at load point...')
      console.log('[Orchestrator] Injecting demo_pause...')
      const pauseOk = await injectTimedSequence([{ cmd: 'demo_pause', delay: 500 }])
      if (!pauseOk) {
        console.warn('[Orchestrator] demo_pause injection failed — CS2 window may not be responsive')
      }

      // ─── Step 8: Start OBS recording ──────────────────────────────
      this.reportProgress('recording', 30, 0, request.highlights.length, 'recording', 'Starting OBS recording...')
      try {
        await this.obsService.startRecording()
        this.obsRecordingActive = true
      } catch (err) {
        return { success: false, clips, error: (err as Error).message }
      }
      const recordingStart = Date.now()

      // ─── Step 9: Per-clip seek + record loop (Insight Agent pattern) ──
      const timestamps: Array<{ id: string; startSec: number; durationSec: number; outputName: string }> = []

      for (let i = 0; i < request.highlights.length; i++) {
        if (this.isCancelled) {
          await this.stopObsSafe()
          break
        }

        const hl = request.highlights[i]
        const gotoTick = Math.max(0, hl.tickStart - request.preRoll * request.tickRate)
        const highlightDuration = (hl.tickEnd - hl.tickStart) / request.tickRate
        const clipDuration = request.preRoll + highlightDuration + request.postRoll

        this.reportProgress('recording', 35 + Math.round((i / request.highlights.length) * 30),
          i, request.highlights.length, 'recording',
          `Recording ${i + 1}/${request.highlights.length}: ${hl.playerName} - ${hl.type}`)

        // Per-clip injection sequence (Insight Agent pattern):
        //   1. demo_pause → gototick → wait for keyframe seek
        //   2. demo_resume → wait for playback to start
        //   3. spec_mode 5 → spec_player → wait for camera switch
        // Delays happen inside PowerShell, non-blocking to Node.
        console.log(`[Orchestrator] Clip ${i + 1}: seeking to tick ${gotoTick} (${hl.playerName})`)
        const seekOk = await injectTimedSequence([
          { cmd: 'demo_pause', delay: 100 },
          { cmd: `demo_gototick ${gotoTick}`, delay: 3500 },
          { cmd: 'demo_resume', delay: 800 },
          { cmd: 'spec_mode 5', delay: 200 },
          { cmd: `spec_player ${hl.playerName}`, delay: 600 },
        ])
        if (!seekOk) console.warn(`[Orchestrator] Injection may have failed for clip ${i + 1}`)

        // Clip start = after full seek+spec sequence settles
        const clipStartOffset = (Date.now() - recordingStart) / 1000

        // Record timestamp for FFmpeg split
        timestamps.push({
          id: hl.id,
          startSec: clipStartOffset,
          durationSec: clipDuration + BUFFER_SEC / request.highlights.length,
          outputName: `${hl.playerName}_${hl.type}_R${hl.round}_${hl.id}.mp4`
        })

        // Wait for clip to play through
        await this.sleepCancellable(clipDuration * 1000)

        // Pause between clips for clean transition
        if (i < request.highlights.length - 1) {
          console.log(`[Orchestrator] Pausing before clip ${i + 2}...`)
          await injectTimedSequence([{ cmd: 'demo_pause', delay: 500 }])
        }

        if (this.isCancelled) break
      }

      // ─── Step 10: Stop OBS recording ─────────────────────────────
      this.reportProgress('stopping', 70, 0, request.highlights.length, 'stopping', 'Stopping OBS recording...')
      let obsOutputPath: string | null = null
      try {
        obsOutputPath = await this.obsService.stopRecording()
        this.obsRecordingActive = false
      } catch (err) {
        return { success: false, clips, error: (err as Error).message }
      }
      if (!obsOutputPath) {
        return { success: false, clips, error: 'OBS did not return output path' }
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 11: FFmpeg split ────────────────────────────────────
      this.reportProgress('splitting', 75, 0, request.highlights.length, 'preparing', 'Splitting video into clips...')
      const ffmpegPath = getFfmpegPath()

      try {
        const outputPaths = await splitVideo(obsOutputPath, timestamps, outputDir, ffmpegPath)
        for (let i = 0; i < request.highlights.length; i++) {
          const hl = request.highlights[i]
          const outputPath = outputPaths[i] ?? ''
          const hd = (hl.tickEnd - hl.tickStart) / request.tickRate
          const duration = request.preRoll + hd + request.postRoll
          let success = false
          try { await fs.access(outputPath); success = true } catch { /* file missing */ }
          clips.push({ highlightId: hl.id, outputPath, duration, success })
        }
        await cleanupObsRecording(obsOutputPath)
      } catch (err) {
        const msg = (err as Error).message
        console.warn(`[Orchestrator] FFmpeg split error: ${msg}`)
        for (let i = clips.length; i < request.highlights.length; i++) {
          const hl = request.highlights[i]
          const hd = (hl.tickEnd - hl.tickStart) / request.tickRate
          clips.push({ highlightId: hl.id, outputPath: '', duration: request.preRoll + hd + request.postRoll, success: false, error: msg })
        }
      }

      const successCount = clips.filter((c) => c.success).length
      this.reportProgress('done', 100, request.highlights.length, request.highlights.length, 'done',
        `Recording complete: ${successCount}/${request.highlights.length} clips`)

      return { success: successCount > 0, clips }
    } catch (err) {
      const message = (err as Error).message
      this.reportProgress('error', 0, 0, request.highlights.length, 'error', message)
      return { success: false, clips, error: message }
    } finally {
      await this.cleanup()
    }
  }

  cancel(): void {
    this.isCancelled = true
    this.stopObsSafe()
    stopGsiServer()
    this.demoLauncher?.terminate()
  }

  // ─── private helpers ──────────────────────────────────────────────

  private async stopObsSafe(): Promise<void> {
    if (this.obsRecordingActive) {
      try { await this.obsService?.stopRecording() } catch { /* ignore */ }
      this.obsRecordingActive = false
    }
    try { await this.obsService?.disconnect() } catch { /* ignore */ }
  }

  private async sleepCancellable(ms: number): Promise<void> {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if (this.isCancelled) return
      const remaining = Math.min(1000, deadline - Date.now())
      if (remaining <= 0) break
      await sleep(remaining)
    }
  }

  /**
   * Poll for CS2 window appearance using the same EnumWindows approach
   * as the injection scripts. Returns true when found within timeout.
   */
  private async waitForCs2Window(): Promise<boolean> {
    const deadline = Date.now() + WINDOW_DETECT_TIMEOUT_MS
    let found = false
    const t0 = Date.now()

    while (Date.now() < deadline && !this.isCancelled) {
      found = await findCs2Window()
      if (found) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
        console.log(`[Orchestrator] CS2 window found after ${elapsed}s`)
        return true
      }
      await sleep(500)
    }

    console.warn(`[Orchestrator] CS2 window not found after ${WINDOW_DETECT_TIMEOUT_MS / 1000}s`)
    return false
  }

  private async cleanup(): Promise<void> {
    if (this.cleanedUp) return
    this.cleanedUp = true
    await this.stopObsSafe()
    stopGsiServer()
    try { await this.demoLauncher?.terminate() } catch { /* ignore */ }
    if (this.launchCfgPath) {
      try { await fs.unlink(this.launchCfgPath) } catch { /* ignore */ }
    }
    if (this.gsiCfgPath) {
      try { await fs.unlink(this.gsiCfgPath) } catch { /* ignore */ }
    }
    if (this.copiedDemoPath) {
      try { await fs.unlink(this.copiedDemoPath) } catch { /* ignore */ }
    }
  }

  private cancelResult(clips: RecordingClipResult[], totalHighlights: number): RecordingResult {
    this.reportProgress('cancelled', 0, 0, totalHighlights, 'skipped', 'Recording cancelled')
    return { success: false, clips, error: 'Cancelled' }
  }

  private reportProgress(
    status: RecordingStatus,
    percent: number,
    currentHighlight: number,
    totalHighlights: number,
    highlightStatus: HighlightRecordingStatus,
    stepLabel: string
  ): void {
    this.onProgress({
      status,
      percent: Math.round(percent),
      currentHighlight,
      totalHighlights,
      highlightStatus,
      stepLabel
    })
  }
}
