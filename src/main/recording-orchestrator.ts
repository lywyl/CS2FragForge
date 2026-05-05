import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { DemoLauncher } from './demo-launcher'
import { OBSService } from './obs-service'
import { writeLaunchCfg, writeGsiCfg } from './cfg-writer'
import { startGsiServer, stopGsiServer, resetGsiReady, waitForGsiReady, awaitGsiAllplayerSlots, awaitFreshGsiSteamId, getLatestGsiTimestamp } from './gsi-ready'
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
const DEMO_SETTLE_MS = 8_000  // increased — CS2 needs time to fully load demo
const OBS_SCENE_NAME = 'CS2FragForge'
const OBS_SOURCE_NAME = 'CS2 Game Capture'
const BUFFER_SEC = 5
const SPEC_CAL_MAX_SLOT = 16
const SPEC_CAL_SLOT_TIMEOUT = 600   // ms per slot for GSI update
const SPEC_CAL_SETTLE_MS = 150     // ms after spec_player before reading GSI
const PRE_KILL_SEC = 3
const POST_KILL_SEC = 3

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class RecordingOrchestrator {
  private isCancelled = false
  private cs2QuitInjected = false
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
    this.cs2QuitInjected = false
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

      // ─── Step 6: Brief settle for demo to initialize ─────────────
      this.reportProgress('loading-demo', 25, 0, request.highlights.length, 'loading', 'Waiting for demo to initialize...')
      await sleep(DEMO_SETTLE_MS)
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ─── Step 7: Pause demo at load point ─────────────────────────
      this.reportProgress('preparing-record', 28, 0, request.highlights.length, 'preparing', 'Pausing demo at load point...')
      console.log('[Orchestrator] Injecting demo_pause...')
      const pauseOk = await injectTimedSequence([{ cmd: 'demo_pause', delay: 500 }])
      if (!pauseOk) {
        console.warn('[Orchestrator] demo_pause injection failed — CS2 window may not be responsive')
      }

      // ─── Step 7.5: Calibrate spec_player slots via GSI ───────────
      // CS2's spec_player requires numeric slot indices. GSI allplayers
      // payload maps steamid -> observer_slot. We seek to tick 0, wait
      // for the allplayers data, then build the mapping.
      this.reportProgress('preparing-record', 29, 0, request.highlights.length, 'preparing', 'Calibrating player slots...')
      const slotBySteamId = await this.calibrateSpecSlots(request)
      if (slotBySteamId.size > 0) {
        console.log(`[Orchestrator] Slot calibration: ${slotBySteamId.size} players mapped`)
        for (const [sid, slot] of slotBySteamId) {
          console.log(`[Orchestrator]   steamid=${sid} -> slot=${slot}`)
        }
      } else {
        console.warn('[Orchestrator] Slot calibration failed — spec_player may not work')
        console.warn('[Orchestrator] Falling back to playerSteamId as slot number')
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

      // ─── Step 9: Per-clip seek + record loop (kill-centric, Insight Agent pattern) ──
      const timestamps: Array<{ id: string; startSec: number; durationSec: number; outputName: string }> = []

      for (let i = 0; i < request.highlights.length; i++) {
        if (this.isCancelled) {
          await this.stopObsSafe()
          break
        }

        const hl = request.highlights[i]
        const isLastClip = i === request.highlights.length - 1

        // ── Kill-centric seek ─────────────────────────────────────
        // If we have kill_ticks, seek to (first_kill - PRE_KILL_SEC) and
        // play until (last_kill + POST_KILL_SEC). Otherwise fall back to
        // clip tickStart/tickEnd + configurable preRoll/postRoll.
        let gotoTick: number
        let clipDurationSec: number
        const tickRate = request.tickRate

        if (hl.killTicks && hl.killTicks.length > 0) {
          const kills = hl.killTicks.sort((a, b) => a - b)
          const firstKill = kills[0]
          const lastKill = kills[kills.length - 1]
          gotoTick = Math.max(0, firstKill - PRE_KILL_SEC * tickRate)
          const endTick = lastKill + POST_KILL_SEC * tickRate
          clipDurationSec = (endTick - gotoTick) / tickRate
          console.log(`[Orchestrator] Clip ${i + 1}: kill-centric ${hl.killTicks.length} kills, tick ${gotoTick}→${endTick} (${clipDurationSec.toFixed(1)}s)`)
        } else {
          // Fallback: use tickStart/tickEnd with preRoll/postRoll
          gotoTick = Math.max(0, hl.tickStart - request.preRoll * tickRate)
          const endTick = hl.tickEnd + request.postRoll * tickRate
          clipDurationSec = (endTick - gotoTick) / tickRate
          console.log(`[Orchestrator] Clip ${i + 1}: full round fallback, tick ${gotoTick}→${endTick} (${clipDurationSec.toFixed(1)}s)`)
        }

        this.reportProgress('recording', 35 + Math.round((i / request.highlights.length) * 30),
          i, request.highlights.length, 'recording',
          `Recording ${i + 1}/${request.highlights.length}: ${hl.playerName} - ${hl.type}`)

        // ── spec_player slot resolution ───────────────────────────
        const calibratedSlot = slotBySteamId.get(String(hl.playerSteamId))
        const parsedSlot = hl.playerUserId > 0 ? hl.playerUserId : null

        let playerSlot: number | null = null
        let specSource: string
        if (calibratedSlot !== undefined && calibratedSlot > 0) {
          playerSlot = calibratedSlot
          specSource = 'gsi-calibrated'
        } else if (parsedSlot !== null && parsedSlot > 0) {
          playerSlot = parsedSlot
          specSource = 'parsed-fallback'
        } else {
          specSource = 'name-fallback'
        }

        console.log(`[Orchestrator] Clip ${i + 1}: goto=${gotoTick} name=${hl.playerName} steamid=${hl.playerSteamId} calSlot=${calibratedSlot} parsedSlot=${parsedSlot} slot=${playerSlot} src=${specSource}`)

        // ── Build spec commands ────────────────────────────────────
        // Insight Agent pattern: spec_mode + spec_player must happen AFTER
        // demo_resume. CS2 silently ignores perspective switches while the
        // demo is paused. We split into two injections:
        //   Phase 1: demo_pause → demo_timescale 1 → demo_gototick → demo_resume
        //   Phase 2: spec_mode 5 → spec_player <N>  (after short settle)
        const specCmds: Array<{ cmd: string; delay: number }> = []
        if (playerSlot !== null && playerSlot > 0) {
          specCmds.push(
            { cmd: 'spec_mode 5', delay: 150 },
            { cmd: `spec_player ${playerSlot}`, delay: 0 },
          )
        } else if (hl.playerName) {
          specCmds.push(
            { cmd: 'spec_mode 5', delay: 150 },
            { cmd: `spec_player "${hl.playerName}"`, delay: 0 },
          )
        }

        // Phase 1: Seek to tick and resume playback
        const seekSteps: Array<{ cmd: string; delay: number }> = [
          { cmd: 'demo_pause', delay: 100 },
          { cmd: 'demo_timescale 1', delay: 0 },
          { cmd: `demo_gototick ${gotoTick}`, delay: 3500 },
          { cmd: 'demo_resume', delay: 250 },
        ]
        const seekOk = await injectTimedSequence(seekSteps)
        if (!seekOk) console.warn(`[Orchestrator] Seek injection failed for clip ${i + 1}`)

        // Phase 2: Switch camera after demo has resumed (CS2 ignores
        // spec_player while paused, so we wait 200ms then inject separately)
        if (seekOk && specCmds.length > 0) {
          await sleep(200)
          const specOk = await injectTimedSequence(specCmds)
          if (!specOk) console.warn(`[Orchestrator] Spec injection failed for clip ${i + 1}`)
        }

        // ── Record timestamp for FFmpeg split ─────────────────────
        const clipStartOffset = (Date.now() - recordingStart) / 1000
        timestamps.push({
          id: hl.id,
          startSec: clipStartOffset,
          durationSec: clipDurationSec + BUFFER_SEC / request.highlights.length,
          outputName: `${hl.playerName}_${hl.type}_R${hl.round}_${hl.id}.mp4`
        })

        // Wait for clip to play through
        await this.sleepCancellable(clipDurationSec * 1000)

        if (isLastClip) {
          // Inject quit AFTER clip finishes — as separate injection so
          // quit doesn't fire mid-clip (it was previously in the seek
          // sequence and would exit CS2 while OBS was still recording)
          console.log('[Orchestrator] Injecting quit after last clip...')
          const quitOk = await injectTimedSequence([{ cmd: 'quit', delay: 500 }])
          if (quitOk) this.cs2QuitInjected = true
        } else {
          console.log(`[Orchestrator] Pausing before clip ${i + 2}...`)
          await injectTimedSequence([{ cmd: 'demo_pause', delay: 500 }])
        }

        if (this.isCancelled) break
      }

      if (this.cs2QuitInjected) {
        console.log('[Orchestrator] CS2 quit injected; will skip taskkill in cleanup')
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
          const duration = timestamps.find(t => t.id === hl.id)?.durationSec ?? 0
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
          const dur = timestamps.find(t => t.id === hl.id)?.durationSec ?? 0
          clips.push({ highlightId: hl.id, outputPath: '', duration: dur, success: false, error: msg })
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
   * Active spec_player slot calibration — Insight Agent pattern.
   *
   * CS2's spec_player requires NUMERIC slot indices, but GSI allplayers
   * observer_slot is unreliable when the demo is paused. Instead we:
   *
   * 1. First try passive allplayers read (fast path)
   * 2. If that fails, actively iterate slots 1..16:
   *    - Inject spec_mode 5 + spec_player <N>
   *    - Wait for GSI to update
   *    - Read player.steamid to determine which player is at slot N
   *    - Build steamid → slot mapping
   *
   * The demo must be UNPAUSED (playing) for spec_player to take effect.
   * We use demo_timescale 0.05 to play in extreme slow-motion during scan.
   */
  private async calibrateSpecSlots(request: RecordingRequest): Promise<Map<string, number>> {
    // ── Fast path: try passive allplayers read first ────────────────
    const passiveSlots = await awaitGsiAllplayerSlots(3000)
    if (passiveSlots.size >= 2) {
      console.log(`[Orchestrator] Passive GSI calibration: ${passiveSlots.size} players`)
      return passiveSlots
    }

    console.log('[Orchestrator] Passive GSI calibration insufficient, starting active slot scan...')

    // ── Active scan: iterate spec_player slots ─────────────────────
    // Resume demo in extreme slow-motion so spec_player takes effect
    // but we don't lose much time
    await injectTimedSequence([
      { cmd: 'demo_timescale 0.05', delay: 50 },
      { cmd: 'demo_resume', delay: 500 },
    ])

    const mapping = new Map<string, number>()
    const maxSlot = SPEC_CAL_MAX_SLOT

    for (let slot = 1; slot <= maxSlot; slot++) {
      if (this.isCancelled) break

      const beforeTimestamp = getLatestGsiTimestamp()
      const ok = await injectTimedSequence([
        { cmd: 'spec_mode 5', delay: 100 },
        { cmd: `spec_player ${slot}`, delay: SPEC_CAL_SETTLE_MS },
        { cmd: 'hideconsole', delay: 0 },
      ])

      if (!ok) {
        console.warn(`[Orchestrator] Spec scan slot ${slot}: inject failed`)
        continue
      }

      const steamId = await awaitFreshGsiSteamId(beforeTimestamp, SPEC_CAL_SLOT_TIMEOUT)
      if (steamId) {
        mapping.set(steamId, slot)
        console.log(`[Orchestrator] Spec scan slot ${slot} → steamid ${steamId}`)
      }
    }

    // Re-pause after scan
    await injectTimedSequence([
      { cmd: 'demo_timescale 1', delay: 100 },
      { cmd: 'demo_pause', delay: 500 },
    ])

    console.log(`[Orchestrator] Active spec scan complete: ${mapping.size} players mapped`)
    for (const [sid, slot] of mapping) {
      console.log(`[Orchestrator]   steamid=${sid} -> slot=${slot}`)
    }
    return mapping
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
    if (!this.cs2QuitInjected) {
      try { await this.demoLauncher?.terminate() } catch { /* ignore */ }
    } else {
      console.log('[Orchestrator] Skipping terminate — quit already injected via console')
    }
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
