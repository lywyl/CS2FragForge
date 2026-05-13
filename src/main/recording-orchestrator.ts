import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { DemoLauncher } from './demo-launcher'
import { OBSService } from './obs-service'
import { writeLaunchCfg, writeGsiCfg } from './cfg-writer'
import {
  startGsiServer, stopGsiServer, resetGsiReady, waitForGsiReady,
  awaitGsiAllplayerSlots, getCurrentGsiPlayerSteamId,
  getLatestGsiTimestamp, awaitGsiFreshSteamId, getLatestGsiPayload
} from './gsi-ready'
import { injectTimedSequence, findCs2Window, sendSpaceTaps } from './win-console-inject'
import { snapshotUserConfigs, restoreUserConfigs, hasSnapshot } from './cs2-config-backup'
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
const SPEC_CAL_MAX_SLOT = 16
const SPEC_CAL_SLOT_TIMEOUT = 600   // ms per slot for GSI update
const SPEC_CAL_SETTLE_MS = 150     // ms after spec_player before reading GSI
const SPEC_CAL_SEEK_PAD = 500      // ticks before first kill to seek for calibration
const PRE_KILL_SEC = 3
const POST_KILL_SEC = 3
// POV replay segments — disabled by default.  When enabled, multi-kill clips
// get additional victim-perspective replays after the main killer segment via
// OBS PauseRecord/ResumeRecord.  Insight Agent has this as an opt-in per-clip
// flag; we keep the code but skip it until the switch-back timing is verified.
const POV_ENABLED = false
// Engine burn compensation (seconds): demo time consumed by injection overhead
// after demo_resume before spec_player takes effect + hideconsole settles.
// Matches Insight Agent's RESUME_DELAY(0.5) + SPEC_SETTLE(0.4) + POST_HIDE(0.55) +
// PRE_RECORD(0.35) + INJECT_OVERHEAD(2.0) = 3.8s.
// Prevents the demo from playing past the kill moment in the wrong camera.
const ENGINE_BURN_SEC = 3.8
// Jump-cut burn compensation (seconds): shorter than ENGINE_BURN_SEC because
// segment间切换 only needs to cover demo_resume + spec_player + hideconsole.
const JUMP_CUT_BURN_SEC = 0.9
// Safety tail pad (seconds): extra recording time after the last kill to avoid
// abrupt cutoff.
const RECORD_TAIL_PAD_SEC = 0.2

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
        { demoStem: stem, fpsMax: 500 },
        this.cfgDir,
        stem
      )

      const outputDir = request.outputDir ?? path.join(path.dirname(request.demoPath), 'clips')
      if (this.isCancelled) return this.cancelResult(clips, request.highlights.length)

      // ── Snapshot user configs before CS2 touches them ─────────────
      // Insight Agent pattern: protect config.cfg / video.txt / user_convars_*.vcfg
      // so that our warmup cvars don't permanently overwrite the player's settings.
      snapshotUserConfigs(request.cs2Path)

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

      // ─── Step 7: Calibrate spec_player slots via GSI ──────────────
      // Skips the old pre-calibration demo_pause — the calibration seek
      // now includes its own pause, and demo_pause is a TOGGLE that
      // would unpause us if we were already paused.
      this.reportProgress('configuring-obs', 15, 0, request.highlights.length, 'preparing', 'Calibrating player slots...')
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

      // ─── Step 8: Per-clip record loop (Insight Agent pattern) ─────
      // Each clip gets its own OBS StartRecord/StopRecord cycle so that:
      //   1. No FFmpeg splitting is needed — OBS produces individual files
      //   2. If one clip's spec_player fails, other clips are unaffected
      //   3. Output filenames are correct per-clip (player_map_round_type.mp4)
      //
      // Insight Agent reference: _execute_single_clip_recording()
      for (let i = 0; i < request.highlights.length; i++) {
        if (this.isCancelled) break

        const hl = request.highlights[i]
        const isLastClip = i === request.highlights.length - 1

        // ── Compute segments for Smart Jump-Cut ─────────
        const tickRate = request.tickRate
        const engineBurnTicks = ENGINE_BURN_SEC * tickRate
        const preRollSec = hl.preRollOverride ?? request.preRoll ?? PRE_KILL_SEC
        const postRollSec = hl.postRollOverride ?? request.postRoll ?? POST_KILL_SEC
        const jumpCutGapSec = 10
        const jumpCutGapTicks = jumpCutGapSec * tickRate

        interface RecordingSegment {
          seekTick: number
          recordStartTick: number
          recordEndTick: number
          recordDurationSec: number
          isFirst: boolean
        }
        
        const segments: RecordingSegment[] = []
        let totalClipSec = 0

        if (!hl.disableJumpCuts && hl.killTicks && hl.killTicks.length >= 2) {
          const kills = hl.killTicks.sort((a, b) => a - b)
          let currentStartTick = kills[0] - preRollSec * tickRate
          let currentEndTick = kills[0] + postRollSec * tickRate

          for (let k = 1; k < kills.length; k++) {
            if (kills[k] - kills[k - 1] > jumpCutGapTicks) {
              // Gap is too big, close current segment
              const recordStartTick = Math.max(0, currentStartTick)
              const recordEndTick = currentEndTick
              const seekTick = Math.max(0, recordStartTick - (segments.length === 0 ? engineBurnTicks : JUMP_CUT_BURN_SEC * tickRate))
              const recordDurationSec = (recordEndTick - recordStartTick) / tickRate + RECORD_TAIL_PAD_SEC
              segments.push({ seekTick, recordStartTick, recordEndTick, recordDurationSec, isFirst: segments.length === 0 })
              totalClipSec += recordDurationSec

              // Start new segment
              currentStartTick = kills[k] - preRollSec * tickRate
              currentEndTick = kills[k] + postRollSec * tickRate
            } else {
              // Extend current segment
              currentEndTick = kills[k] + postRollSec * tickRate
            }
          }
          // Close the last segment
          const recordStartTick = Math.max(0, currentStartTick)
          const recordEndTick = currentEndTick
          const seekTick = Math.max(0, recordStartTick - (segments.length === 0 ? engineBurnTicks : JUMP_CUT_BURN_SEC * tickRate))
          const recordDurationSec = (recordEndTick - recordStartTick) / tickRate + RECORD_TAIL_PAD_SEC
          segments.push({ seekTick, recordStartTick, recordEndTick, recordDurationSec, isFirst: segments.length === 0 })
          totalClipSec += recordDurationSec
        } else {
          // Single continuous segment
          const startTick = (hl.killTicks && hl.killTicks.length > 0) ? hl.killTicks[0] : hl.tickStart
          const endTick = (hl.killTicks && hl.killTicks.length > 0) ? hl.killTicks[hl.killTicks.length - 1] : hl.tickEnd
          const recordStartTick = Math.max(0, startTick - preRollSec * tickRate)
          const recordEndTick = endTick + postRollSec * tickRate
          const seekTick = Math.max(0, recordStartTick - engineBurnTicks)
          const recordDurationSec = (recordEndTick - recordStartTick) / tickRate + RECORD_TAIL_PAD_SEC
          segments.push({ seekTick, recordStartTick, recordEndTick, recordDurationSec, isFirst: true })
          totalClipSec = recordDurationSec
        }

        const firstGotoTick = segments[0].seekTick

        this.reportProgress('recording', 30 + Math.round((i / request.highlights.length) * 40),
          i, request.highlights.length, 'recording',
          `Recording ${i + 1}/${request.highlights.length}: ${hl.playerName} - ${hl.type}`)

        // ── spec_player slot resolution (per-clip) ──────────────────
        // Priority: GSI calibrated slot (by steamid) > GSI calibrated slot (by name) > parsed
        // Only numeric slots are accepted for reliable recording.
        const calibratedSlot = slotBySteamId.get(hl.playerSteamId)
        // Name-based fallback: steam IDs may lose precision through JSON/pandas,
        // but player names are always exact.
        const calibratedByName = slotBySteamId.get(`name:${hl.playerName.toLowerCase()}`)
        const parsedSlot = hl.playerUserId > 0 ? hl.playerUserId : null

        let playerSlot: number | null = null
        let specSource: string
        if (calibratedSlot !== undefined && calibratedSlot > 0) {
          playerSlot = calibratedSlot
          specSource = 'gsi-calibrated'
        } else if (calibratedByName !== undefined && calibratedByName > 0) {
          playerSlot = calibratedByName
          specSource = 'gsi-calibrated-by-name'
        } else if (parsedSlot !== null && parsedSlot > 0) {
          playerSlot = parsedSlot
          specSource = 'parsed-fallback'
        } else {
          // No numeric slot available — name fallback is unreliable
          specSource = 'name-fallback'
          console.warn(`[Orchestrator] Clip ${i + 1}: No numeric slot for ${hl.playerName}, will attempt name fallback`)
        }

        console.log(`[Orchestrator] Clip ${i + 1}: goto=${firstGotoTick} name=${hl.playerName} steamid=${hl.playerSteamId} calSlot=${calibratedSlot} calByName=${calibratedByName} parsedSlot=${parsedSlot} slot=${playerSlot} src=${specSource} segments=${segments.length}`)

        // ── Space-tap priming (Insight Agent "spec prime") ─────────
        // Tapping Space before seeking activates the demo playback UI's
        // player-switching system.  Without this, spec_player may be
        // silently ignored on third-party demos (5E, etc.).
        if (i === 0) {
          const spaceOk = await sendSpaceTaps(1)
          if (!spaceOk) console.warn(`[Orchestrator] Space tap failed for clip ${i + 1}`)
        }

        // ── Session warmup cvars (first clip only) ──────────────────
        if (i === 0) {
          await injectTimedSequence([
            { cmd: 'cl_draw_only_deathnotices 1', delay: 50 },
            { cmd: 'spec_show_xray 1', delay: 50 },
            { cmd: 'hud_showtargetid 0', delay: 50 },
            { cmd: 'tv_nochat 1', delay: 50 },
            { cmd: 'cl_hud_telemetry_frametime_show 0', delay: 50 },
          ])
        }

        // ── Prepare first segment BEFORE starting OBS recording ─────
        const firstSegment = segments[0]
        const prepared = await this.prepareSegmentPlayback(firstSegment, playerSlot, hl.playerName)
        
        if (!prepared) {
          clips.push({
            highlightId: hl.id,
            outputPath: '',
            duration: totalClipSec,
            success: false,
            error: 'Failed to prepare target POV',
          })
          continue
        }

        // ── OBS StartRecord for THIS clip ──────────────────────────
        // Must happen AFTER demo_gototick + demo_resume + spec_player + hideconsole + settle
        this.obsRecordingActive = false
        try {
          await this.obsService.startRecording()
          this.obsRecordingActive = true
        } catch (err) {
          clips.push({
            highlightId: hl.id,
            outputPath: '',
            duration: totalClipSec,
            success: false,
            error: (err as Error).message,
          })
          continue
        }

        // ── Wait for first segment to play through ─────────────────
        await this.sleepCancellable(firstSegment.recordDurationSec * 1000)

        // ── Handle subsequent segments (jump cuts) ─────────────────
        let injectOk = true
        for (let segIdx = 1; segIdx < segments.length; segIdx++) {
          const seg = segments[segIdx]

          // Pause OBS before seeking
          try { await this.obsService.pauseRecording() } catch { /* ignore */ }

          // Prepare segment while OBS is paused
          const segPrepared = await this.prepareSegmentPlayback(seg, playerSlot, hl.playerName)
          if (!segPrepared) {
            console.warn(`[Orchestrator] Segment ${segIdx + 1} preparation failed for clip ${i + 1}`)
            injectOk = false
          }

          // Resume OBS after preparation
          await sleep(200)
          try { await this.obsService.resumeRecording() } catch { /* ignore */ }

          // Wait for segment to play through
          await this.sleepCancellable(seg.recordDurationSec * 1000)
        }

        // ── POV replay segments (Insight Agent pattern) ────────────
        // For multi-kill clips with victim data, pause OBS, seek back to
        // each victim's death tick, switch spec to the victim, and record
        // a brief replay (2s before + 2s after the kill).  OBS PauseRecord/
        // ResumeRecord keeps all segments in a single output file.
        if (
          POV_ENABLED &&
          injectOk &&
          hl.killDetails &&
          hl.killDetails.length >= 2 &&
          playerSlot !== null &&
          playerSlot > 0
        ) {
          const replayPreSec = 2
          const replayPostSec = 2
          const replayDurationSec = replayPreSec + replayPostSec

          for (let ki = 0; ki < hl.killDetails.length; ki++) {
            if (this.isCancelled) break
            const kd = hl.killDetails[ki]

            // Resolve victim spec slot
            let vSlot = slotBySteamId.get(String(kd.victimSteamId))
            if (!vSlot || vSlot <= 0) vSlot = kd.victimUserId
            if (!vSlot || vSlot <= 0) {
              console.warn(`[Orchestrator] POV skip: no slot for victim ${kd.victimName}`)
              continue
            }

            console.log(`[Orchestrator] POV ${ki + 1}/${hl.killDetails.length}: victim=${kd.victimName} slot=${vSlot} tick=${kd.tick}`)

            // ── Pause OBS ────────────────────────────────────────
            try { await this.obsService.pauseRecording() } catch { continue }

            // ── Pause demo + seek + switch spec + resume (short GOTO for nearby seek) ──
            const povTick = Math.max(0, kd.tick - replayPreSec * tickRate)
            const povOk = await injectTimedSequence([
              { cmd: 'demo_pause', delay: 100 },
              { cmd: 'demo_timescale 1', delay: 0 },
              { cmd: `demo_gototick ${povTick}`, delay: 1000 },
              { cmd: 'demo_resume', delay: 300 },
              { cmd: 'spec_mode 5', delay: 100 },
              { cmd: `spec_player ${vSlot}`, delay: 300 },
              { cmd: 'hideconsole', delay: 350 },
            ])

            if (!povOk) {
              console.warn(`[Orchestrator] POV inject failed for ${kd.victimName}`)
              try { await this.obsService.resumeRecording() } catch { /* ignore */ }
              continue
            }

            // ── Pre-record settle ────────────────────────────────
            await sleep(200)

            // ── Resume OBS ───────────────────────────────────────
            try { await this.obsService.resumeRecording() } catch { continue }

            // ── Wait for replay ──────────────────────────────────
            await this.sleepCancellable(replayDurationSec * 1000)
            totalClipSec += replayDurationSec
          }

          // ── Pause OBS before switching spec back ─────────────────
          // The last POV segment left OBS recording; pause it now so the
          // console UI from the spec-switch injection isn't captured.
          try { await this.obsService.pauseRecording() } catch { /* ignore */ }

          // ── Switch spec back to killer for next clip ────────────
          if (!isLastClip && !this.isCancelled) {
            await injectTimedSequence([
              { cmd: 'demo_pause', delay: 100 },
              { cmd: 'spec_mode 5', delay: 100 },
              { cmd: `spec_player ${playerSlot}`, delay: 300 },
              { cmd: 'hideconsole', delay: 200 },
            ])
            // Resume demo so it's PLAYING — the next clip's combined
            // injection starts with demo_pause (a TOGGLE) and must
            // target a playing demo to correctly pause it.
            await injectTimedSequence([{ cmd: 'demo_resume', delay: 100 }])
          }
        }

        // ── OBS StopRecord for THIS clip ────────────────────────────
        let obsOutputPath: string | null = null
        try {
          // Ensure recording is not paused before stopping
          try { await this.obsService.resumeRecording() } catch { /* may already be recording */ }
          obsOutputPath = await this.obsService.stopRecording()
          this.obsRecordingActive = false
        } catch (err) {
          clips.push({
            highlightId: hl.id,
            outputPath: '',
            duration: totalClipSec,
            success: false,
            error: (err as Error).message,
          })
          continue
        }

        if (!obsOutputPath) {
          clips.push({
            highlightId: hl.id,
            outputPath: '',
            duration: totalClipSec,
            success: false,
            error: 'OBS did not return output path',
          })
          continue
        }

        // ── Rename output to a meaningful name ──────────────────────
        const targetName = `${hl.playerName}_${hl.type}_R${hl.round}_${hl.id}.mp4`
        const targetPath = path.join(outputDir, targetName)
        try {
          await fs.mkdir(outputDir, { recursive: true })
          await fs.rename(obsOutputPath, targetPath)
          console.log(`[Orchestrator] Clip ${i + 1} saved: ${targetPath} (${totalClipSec.toFixed(1)}s)`)
          clips.push({
            highlightId: hl.id,
            outputPath: targetPath,
            duration: totalClipSec,
            success: true,
          })
        } catch (err) {
          console.warn(`[Orchestrator] Rename failed for clip ${i + 1}, using original path`)
          clips.push({
            highlightId: hl.id,
            outputPath: obsOutputPath,
            duration: totalClipSec,
            success: true,
          })
        }

        // ── After last clip: inject quit ────────────────────────────
        if (isLastClip) {
          console.log('[Orchestrator] Injecting quit after last clip...')
          const quitOk = await injectTimedSequence([{ cmd: 'quit', delay: 500 }])
          if (quitOk) this.cs2QuitInjected = true
        }

        if (this.isCancelled) break
      }

      if (this.cs2QuitInjected) {
        console.log('[Orchestrator] CS2 quit injected; will skip taskkill in cleanup')
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
   * Prepare a segment for playback: seek to tick, resume demo, switch to target player, hide console.
   * This helper must be called BEFORE OBS StartRecord or ResumeRecord.
   * 
   * @returns true if preparation succeeded, false otherwise
   */
  private async prepareSegmentPlayback(
    segment: RecordingSegment,
    playerSlot: number | null,
    playerName: string
  ): Promise<boolean> {
    // Phase 1: Seek to target tick
    let ok = await injectTimedSequence([
      { cmd: 'demo_pause', delay: 100 },
      { cmd: 'demo_timescale 1', delay: 0 },
      { cmd: `demo_gototick ${segment.seekTick}`, delay: 3500 },
    ])
    if (!ok) {
      console.warn('[Orchestrator] prepareSegmentPlayback: Phase 1 (seek) failed')
      return false
    }

    // Phase 2: Resume playback
    ok = await injectTimedSequence([
      { cmd: 'demo_resume', delay: 500 },
    ])
    if (!ok) {
      console.warn('[Orchestrator] prepareSegmentPlayback: Phase 2 (resume) failed')
      return false
    }

    // Phase 3: Switch to target player
    if (playerSlot !== null && playerSlot > 0) {
      ok = await injectTimedSequence([
        { cmd: 'spec_mode 5', delay: 150 },
        { cmd: `spec_player ${playerSlot}`, delay: 400 },
      ])
    } else if (playerName) {
      // Name fallback: log warning but continue (not reliable)
      console.warn(`[Orchestrator] prepareSegmentPlayback: using name fallback for ${playerName}`)
      ok = await injectTimedSequence([
        { cmd: 'spec_mode 5', delay: 150 },
        { cmd: `spec_player "${playerName}"`, delay: 400 },
      ])
    }
    if (!ok) {
      console.warn('[Orchestrator] prepareSegmentPlayback: Phase 3 (spec_player) failed')
      return false
    }

    // Phase 4: Hide console
    await injectTimedSequence([
      { cmd: 'hideconsole', delay: 550 },
    ])

    // Pre-record settle
    await sleep(350)

    return true
  }

  /**
   * Smart spec_player slot calibration — Insight Agent pattern.
   *
   * Key improvements over the original implementation:
   * 1. Uses fresh GSI payload detection (awaitGsiFreshSteamId) instead of fixed sleep
   * 2. Sliding window optimal scoring for slot selection
   * 3. Degeneracy detection — rejects unusable samples
   * 4. Staged injection to avoid demo_gototick async I/O dropping spec_player
   * 5. Name-based fallback with extra offset for third-party demos
   *
   * Returns a Map<steamid, slot> that maps player Steam IDs to console
   * spec_player slot numbers.
   */
  private async calibrateSpecSlots(request: RecordingRequest): Promise<Map<string, number>> {
    // ── Try passive allplayers read for diagnostics ─────────────────
    // GSI allplayers observer_slot does NOT reliably match console spec_player
    // slot numbering (Insight Agent: "allplayers observer_slot is complete but
    // not treated as console spec_player").  We read it only for logging; the
    // active scan below is authoritative.
    const passiveSlots = await awaitGsiAllplayerSlots(3000)
    if (passiveSlots.size > 0) {
      console.log(`[Orchestrator] Passive GSI allplayers: ${passiveSlots.size} players (diagnostic only)`)
    }

    // ── Determine calibration tick ─────────────────────────────────
    // Insight Agent pattern: use round_freeze_end + 0.5s to ensure all players are present.
    // Fallback: first kill - 500 ticks if freeze_end not available.
    const allKillTicks = request.highlights
      .flatMap(h => h.killTicks ?? [])
      .filter(t => t > 0)
      .sort((a, b) => a - b)

    // Try to find a round_freeze_end tick from the highlights
    // If not available, use the first kill with padding
    const calTick = allKillTicks.length > 0
      ? Math.max(1, allKillTicks[0] - SPEC_CAL_SEEK_PAD)
      : Math.max(1, request.tickRate)

    console.log(`[Orchestrator] Calibration tick: ${calTick} (first kill ~${allKillTicks[0] ?? '?'})`)

    // ── Determine how many slots to scan ────────────────────────────
    // Always scan full range 1..SPEC_CAL_MAX_SLOT for reliable calibration
    const targetSteamIds = new Set(
      request.highlights.map(h => String(h.playerSteamId))
    )
    const highlightPlayerCount = targetSteamIds.size
    const maxSlot = SPEC_CAL_MAX_SLOT

    console.log(`[Orchestrator] Calibration targets: ${highlightPlayerCount} highlight player(s), scanning slots 1..${maxSlot}`)

    // ── Seek to calibration tick — STAGED injection ─────────────────
    // Insight Agent pattern: demo_pause + demo_gototick together, then
    // demo_timescale + demo_resume separately.  This prevents spec_player
    // from being dropped during gototick's async I/O.
    const seekOk = await injectTimedSequence([
      { cmd: 'demo_pause', delay: 100 },
      { cmd: `demo_gototick ${calTick}`, delay: 3500 },
    ])
    if (!seekOk) {
      console.warn('[Orchestrator] Calibration seek failed — falling back to parsed slots')
      return new Map()
    }

    // ── Stage 2: timescale + resume (separate from gototick) ────────
    await injectTimedSequence([
      { cmd: 'demo_timescale 0.05', delay: 50 },
      { cmd: 'demo_resume', delay: 500 },
    ])

    // ── Post-seek settle: let GSI stabilise at the new tick ─────────
    // Insight Agent waits goto_delay(2s) + resume_delay(4s) before scanning.
    console.log('[Orchestrator] Post-seek settle (4s) for GSI stabilisation...')
    await sleep(4000)

    // ── Active scan: iterate slots with fresh-payload detection ─────
    // Insight Agent pattern: record timestamp before each spec_player,
    // then wait for a NEW GSI payload (not just a fixed delay).
    const samples = new Map<number, string>()  // slot -> steamid
    const candidates = new Map<string, number[]>()  // steamid -> [slots]

    for (let slot = 1; slot <= maxSlot; slot++) {
      if (this.isCancelled) break

      const beforeSlot = getLatestGsiTimestamp()
      const ok = await injectTimedSequence([
        { cmd: 'spec_mode 5', delay: 100 },
        { cmd: `spec_player ${slot}`, delay: SPEC_CAL_SETTLE_MS },
      ])

      if (!ok) {
        console.warn(`[Orchestrator] Spec scan slot ${slot}: inject failed`)
        continue
      }

      // Wait for fresh GSI payload (new data after spec_player took effect)
      const steamId = await awaitGsiFreshSteamId(beforeSlot, 2000)
      if (steamId) {
        samples.set(slot, steamId)
        const existing = candidates.get(steamId) || []
        existing.push(slot)
        candidates.set(steamId, existing)
        console.log(`[Orchestrator] Spec scan slot ${slot} → ${steamId}`)
      }
    }

    // ── Sliding window optimal scoring (Insight Agent pattern) ──────
    // Find the best contiguous window of slots that maps to known players.
    const windowLen = Math.min(highlightPlayerCount, maxSlot)
    let bestStart = 1
    let bestScore: [number, number, number, number] = [-1, -9999, -1, -9999]
    let bestValues: string[] = []

    for (let start = 1; start <= maxSlot - windowLen + 1; start++) {
      const vals: string[] = []
      for (let s = start; s < start + windowLen; s++) {
        const sid = samples.get(s)
        if (sid && targetSteamIds.has(sid)) {
          vals.push(sid)
        }
      }
      const unique = new Set(vals)
      const duplicateCount = Math.max(0, vals.length - unique.size)
      const score: [number, number, number, number] = [unique.size, -duplicateCount, vals.length, -start]
      if (score[0] > bestScore[0] ||
          (score[0] === bestScore[0] && score[1] > bestScore[1]) ||
          (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] > bestScore[2]) ||
          (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] === bestScore[2] && score[3] > bestScore[3])) {
        bestScore = score
        bestStart = start
        bestValues = vals
      }
    }

    const bestUniqueCount = new Set(bestValues).size

    // ── Degeneracy detection (Insight Agent pattern) ────────────────
    // If only 1 unique player found but we expect more, reject the calibration.
    const mapping = new Map<string, number>()

    if (highlightPlayerCount > 1 && bestUniqueCount <= 1) {
      console.warn(`[Orchestrator] Calibration rejected: degenerate samples (unique=${bestUniqueCount}/${highlightPlayerCount})`)
      // Fallback: use parsed slots (Python already handles offset)
      for (const hl of request.highlights) {
        if (hl.playerUserId > 0) {
          mapping.set(hl.playerSteamId, hl.playerUserId)
          mapping.set(`name:${hl.playerName.toLowerCase()}`, hl.playerUserId)
        }
      }
      console.log(`[Orchestrator] Fallback: using parsed slots (${mapping.size} entries)`)
    } else {
      // Use the best window
      for (let s = bestStart; s < bestStart + windowLen; s++) {
        const sid = samples.get(s)
        if (sid && targetSteamIds.has(sid) && !mapping.has(sid)) {
          mapping.set(sid, s)
        }
      }

      // ── Build name→slot entries for steam-id-precision-safe lookup ──
      // SteamID64 values from demoparser2 may lose precision through pandas float64.
      // Player names are always exact, so we add name-based keys as a safe fallback.
      for (const hl of request.highlights) {
        const sid = hl.playerSteamId
        const nameKey = `name:${hl.playerName.toLowerCase()}`
        if (sid && mapping.has(sid) && !mapping.has(nameKey)) {
          mapping.set(nameKey, mapping.get(sid)!)
        }
      }
    }

    // ── Reset demo state ────────────────────────────────────────────
    // demo_pause is a TOGGLE in CS2.  The combined injection for each
    // clip starts with demo_pause to pause the demo before seeking.
    // If we paused here, the clip's leading demo_pause would UNPAUSE
    // instead.  So we reset timescale and let the demo coast at 1x.
    await injectTimedSequence([
      { cmd: 'demo_timescale 1', delay: 100 },
    ])

    console.log(`[Orchestrator] Calibration done: ${mapping.size} slots mapped (window start=${bestStart}, unique=${bestUniqueCount}/${highlightPlayerCount})`)
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

  /**
   * Poll for CS2 window to disappear. Used after quit injection to ensure
   * CS2 has fully exited before restoring user config files.
   */
  private async waitForCs2Exit(): Promise<void> {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const found = await findCs2Window()
      if (!found) {
        console.log('[Orchestrator] CS2 window gone — safe to restore configs')
        return
      }
      await sleep(300)
    }
    console.warn('[Orchestrator] CS2 window still present after 10s — restoring configs anyway')
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
      // Wait for CS2 to fully exit before touching config files (quit takes ~2-3s)
      await this.waitForCs2Exit()
    }
    // Restore user config files to pre-recording state
    if (hasSnapshot()) {
      restoreUserConfigs()
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
