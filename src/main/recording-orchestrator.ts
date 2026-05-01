import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { DemoLauncher } from './demo-launcher'
import { ConsoleLogWatcher } from './console-log-watcher'
import { OBSService } from './obs-service'
import { writeLaunchCfg } from './cfg-writer'
import { injectTimedSequence } from './win-console-inject'
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

const CS2_READY_TIMEOUT_MS = 120_000
const DEMO_LOAD_TIMEOUT_MS = 60_000
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
  private consoleWatcher: ConsoleLogWatcher | null = null
  private cfgDir: string | null = null
  private launchCfgPath: string | null = null
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

      // ─── Step 3: Prepare demo + launch CFG ────────────────────────
      this.reportProgress('preparing', 12, 0, request.highlights.length, 'preparing', 'Preparing demo...')
      this.demoLauncher = new DemoLauncher(request.cs2Path)
      this.cfgDir = path.join(request.cs2Path, 'game', 'csgo', 'cfg')

      const stem = `_cs2ff_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

      await this.demoLauncher.copyDemoToCsgo(request.demoPath, stem)
      this.copiedDemoPath = path.join(request.cs2Path, 'game', 'csgo', `${stem}.dem`)

      this.launchCfgPath = await writeLaunchCfg(
        { demoStem: stem, fpsMax: 30 },
        this.cfgDir,
        stem
      )

      const outputDir = request.outputDir ?? path.join(path.dirname(request.demoPath), 'clips')
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 4: Launch CS2 ───────────────────────────────────────
      this.reportProgress('launching-cs2', 15, 0, request.highlights.length, 'launching', 'Launching CS2...')
      try {
        await this.demoLauncher.launch(stem)
      } catch (err) {
        await this.obsService.disconnect()
        return { success: false, clips, error: (err as Error).message }
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 5: Wait for CS2 ready ───────────────────────────────
      this.reportProgress('waiting-load', 20, 0, request.highlights.length, 'loading', 'Waiting for CS2 to start...')
      const readyResult = await this.waitForCs2Ready(request.cs2Path)
      if (readyResult.timedOut) {
        console.warn('[Orchestrator] CS2 ready timed out — proceeding anyway')
      }
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 6: Wait for demo load ──────────────────────────────
      this.reportProgress('loading-demo', 25, 0, request.highlights.length, 'loading', 'Waiting for demo to load...')
      const loadResult = await this.waitForDemoLoad(request.cs2Path)
      if (loadResult.timedOut) {
        console.warn('[Orchestrator] Demo load timed out — proceeding anyway')
      }
      // Extra wait for CS2 demo UI to fully stabilize (engine keyframe buffering)
      await sleep(5000)
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

      // ─── Step 9: Per-clip seek + record loop ──────────────────────
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

        // ── Per-clip injection, Insight Agent pattern ──
        // Stage 1: pause + gototick + wait 3.5s + resume (all in ONE batch, console stays open)
        console.log(`[Orchestrator] Clip ${i + 1}: seeking to tick ${gotoTick} (${hl.playerName})`)
        const seekOk = await injectTimedSequence([
          { cmd: 'demo_pause', delay: 100 },
          { cmd: 'demo_timescale 1', delay: 100 },
          { cmd: `demo_gototick ${gotoTick}`, delay: 3500 },
          { cmd: 'demo_resume', delay: 500 },
        ])
        if (!seekOk) console.warn(`[Orchestrator] Seek injection may have failed for clip ${i + 1}`)

        // Clip start = moment demo_resume takes effect (~after 3.5s gototick delay)
        const clipStartOffset = (Date.now() - recordingStart) / 1000

        // Stage 2: spec_mode + spec_player (separate call so it doesn't interfere with seek timing)
        await injectTimedSequence([
          { cmd: 'spec_mode 5', delay: 0 },
          { cmd: `spec_player ${hl.playerName}`, delay: 400 },
        ])

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
    this.demoLauncher?.terminate()
    this.consoleWatcher?.stop()
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

  private async waitForCs2Ready(cs2Path: string): Promise<{ timedOut: boolean }> {
    return new Promise((resolve) => {
      const logPath = path.join(cs2Path, 'game', 'csgo', 'console.log')
      let resolved = false
      const t0 = Date.now()
      const watcher = new ConsoleLogWatcher(logPath, (event) => {
        if (event.type === 'cs2-ready' && !resolved) {
          resolved = true; watcher.stop()
          console.log(`[Orchestrator] CS2 ready after ${((Date.now() - t0) / 1000).toFixed(1)}s`)
          resolve({ timedOut: false })
        }
      })
      this.consoleWatcher = watcher
      watcher.start()
      setTimeout(() => {
        if (!resolved) { resolved = true; watcher.stop(); console.warn('[Orchestrator] CS2 ready timed out'); resolve({ timedOut: true }) }
      }, CS2_READY_TIMEOUT_MS)
    })
  }

  private async waitForDemoLoad(cs2Path: string): Promise<{ timedOut: boolean }> {
    return new Promise((resolve) => {
      const logPath = path.join(cs2Path, 'game', 'csgo', 'console.log')
      let resolved = false
      const t0 = Date.now()
      const watcher = new ConsoleLogWatcher(logPath, (event) => {
        if (event.type === 'demo-loaded' && !resolved) {
          resolved = true; watcher.stop()
          console.log(`[Orchestrator] Demo loaded after ${((Date.now() - t0) / 1000).toFixed(1)}s`)
          resolve({ timedOut: false })
        }
      })
      this.consoleWatcher = watcher
      watcher.start()
      setTimeout(() => {
        if (!resolved) { resolved = true; watcher.stop(); console.warn('[Orchestrator] Demo load timed out'); resolve({ timedOut: true }) }
      }, DEMO_LOAD_TIMEOUT_MS)
    })
  }

  private async cleanup(): Promise<void> {
    if (this.cleanedUp) return
    this.cleanedUp = true
    await this.stopObsSafe()
    try { await this.demoLauncher?.terminate() } catch { /* ignore */ }
    try { await this.consoleWatcher?.stop() } catch { /* ignore */ }
    if (this.launchCfgPath) {
      try { await fs.unlink(this.launchCfgPath) } catch { /* ignore */ }
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
