import path from 'path'
import fs from 'fs/promises'
import { DemoLauncher } from './demo-launcher'
import { ConsoleLogWatcher } from './console-log-watcher'
import { OBSService } from './obs-service'
import { writeCustomCfg } from './cfg-writer'
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

const DEMO_LOAD_TIMEOUT_MS = 45_000
const OBS_SCENE_NAME = 'CS2FragForge'
const OBS_SOURCE_NAME = 'CS2 Game Capture'
const BUFFER_SEC = 5

export class RecordingOrchestrator {
  private isCancelled = false
  private obsService: OBSService | null = null
  private demoLauncher: DemoLauncher | null = null
  private consoleWatcher: ConsoleLogWatcher | null = null
  private cfgDir: string | null = null
  private autoexecPath: string | null = null
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
      // Step 1: Connect to OBS
      this.reportProgress('connecting-obs', 5, 0, request.highlights.length, 'preparing', 'Connecting to OBS...')
      this.obsService = new OBSService()

      try {
        await this.obsService.connect(request.obsConfig)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OBS connection failed'
        this.reportProgress('error', 0, 0, request.highlights.length, 'error', msg)
        return { success: false, clips, error: msg }
      }

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 2: Configure OBS scene + source
      this.reportProgress('configuring-obs', 10, 0, request.highlights.length, 'preparing', 'Configuring OBS scene...')
      try {
        await this.obsService.ensureScene(OBS_SCENE_NAME)
        await this.obsService.ensureGameCaptureSource(OBS_SCENE_NAME, OBS_SOURCE_NAME)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OBS configuration failed'
        await this.obsService.disconnect()
        this.reportProgress('error', 0, 0, request.highlights.length, 'error', msg)
        return { success: false, clips, error: msg }
      }

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 3: Copy demo + write combined CFG (custom file, NOT autoexec.cfg)
      this.reportProgress('preparing', 10, 0, request.highlights.length, 'preparing', 'Preparing demo and config...')
      this.demoLauncher = new DemoLauncher(request.cs2Path)

      // Store demo basename without extension for playdemo command (CS2 omits .dem)
      const demoFileBase = path.basename(request.demoPath, '.dem')
      await this.demoLauncher.copyDemoToReplays(request.demoPath)

      this.cfgDir = path.join(request.cs2Path, 'game', 'csgo', 'cfg')
      const outputDir = request.outputDir ?? path.join(path.dirname(request.demoPath), 'clips')

      const combinedCfgName = 'cs2fragforge_combined.cfg'
      this.autoexecPath = await writeCustomCfg(
        {
          highlights: request.highlights.map((h) => ({
            id: h.id,
            playerName: h.playerName,
            tickStart: h.tickStart,
            tickEnd: h.tickEnd,
            round: h.round,
            type: h.type
          })),
          tickRate: request.tickRate,
          preRoll: request.preRoll,
          postRoll: request.postRoll
        },
        this.cfgDir,
        combinedCfgName
      )

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 4: Launch CS2 (bare-bones — no +playdemo, no +exec)
      this.reportProgress('launching-cs2', 15, 0, request.highlights.length, 'launching', 'Launching CS2...')
      try {
        await this.demoLauncher.launch()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'CS2 launch failed'
        await this.obsService.disconnect()
        this.reportProgress('error', 0, 0, request.highlights.length, 'error', msg)
        return { success: false, clips, error: msg }
      }

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 5: Wait for CS2 main menu, then inject ALL commands via stdin
      this.reportProgress('waiting-load', 20, 0, request.highlights.length, 'loading', 'Waiting for CS2 to start...')
      const readyResult = await this.waitForCs2Ready(request.cs2Path)
      if (readyResult.timedOut) {
        console.warn('[Orchestrator] CS2 ready timed out — injecting commands anyway')
      }

      // Inject playdemo first (uses replays/ prefix, no .dem extension)
      this.demoLauncher.sendCommand(`playdemo replays/${demoFileBase}`)
      console.log(`[Orchestrator] Injected: playdemo replays/${demoFileBase}`)

      // Wait for demo to load
      await new Promise((r) => setTimeout(r, 3000))
      const loadResult = await this.waitForDemoLoad(request.cs2Path)
      if (loadResult.timedOut) {
        console.warn('[Orchestrator] Demo load timed out — injecting CFG anyway')
      }

      // Inject the combined recording CFG
      this.demoLauncher.sendCommand(`exec ${combinedCfgName}`)
      console.log(`[Orchestrator] Injected: exec ${combinedCfgName}`)

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 6: Start OBS recording
      this.reportProgress('recording', 30, 0, request.highlights.length, 'recording', 'Starting OBS recording...')
      try {
        await this.obsService.startRecording()
        this.obsRecordingActive = true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OBS recording start failed'
        this.reportProgress('error', 0, 0, request.highlights.length, 'error', msg)
        return { success: false, clips, error: msg }
      }

      // Step 7: Wait for total duration
      const totalDuration = this.calculateTotalDuration(request)
      this.reportProgress('recording', 35, 0, request.highlights.length, 'recording',
        `Recording ${request.highlights.length} highlights (${Math.ceil(totalDuration)}s)...`)
      await this.waitWithProgress(totalDuration, request.highlights.length)

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 8: Stop OBS recording
      this.reportProgress('stopping', 70, 0, request.highlights.length, 'stopping', 'Stopping OBS recording...')
      let obsOutputPath: string | null = null
      try {
        obsOutputPath = await this.obsService.stopRecording()
        this.obsRecordingActive = false
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OBS recording stop failed'
        this.reportProgress('error', 0, 0, request.highlights.length, 'error', msg)
        return { success: false, clips, error: msg }
      }

      if (!obsOutputPath) {
        const msg = 'OBS did not return output path'
        this.reportProgress('error', 0, 0, request.highlights.length, 'error', msg)
        return { success: false, clips, error: msg }
      }

      if (this.isCancelled) return await this.cancelResult(clips, request.highlights.length)

      // Step 9: FFmpeg split
      this.reportProgress('splitting', 75, 0, request.highlights.length, 'preparing', 'Splitting video into clips...')

      const timestamps = this.buildTimestamps(request)
      const ffmpegPath = getFfmpegPath()

      try {
        const outputPaths = await splitVideo(obsOutputPath, timestamps, outputDir, ffmpegPath)

        // Build clip results
        for (let i = 0; i < request.highlights.length; i++) {
          const hl = request.highlights[i]
          const outputPath = outputPaths[i] ?? ''
          const highlightDuration = (hl.tickEnd - hl.tickStart) / request.tickRate
          const duration = request.preRoll + highlightDuration + request.postRoll

          let success = false
          try {
            await fs.access(outputPath)
            success = true
          } catch {
            // file doesn't exist
          }

          clips.push({
            highlightId: hl.id,
            outputPath,
            duration,
            success
          })
        }

        // Cleanup OBS recording file
        await cleanupObsRecording(obsOutputPath)
      } catch (err) {
        // Partial success: some clips may have been created
        const msg = err instanceof Error ? err.message : 'FFmpeg split failed'
        console.warn(`[Orchestrator] FFmpeg split error: ${msg}`)

        // Fill in any missing clips as failed
        for (let i = clips.length; i < request.highlights.length; i++) {
          const hl = request.highlights[i]
          const highlightDuration = (hl.tickEnd - hl.tickStart) / request.tickRate
          clips.push({
            highlightId: hl.id,
            outputPath: '',
            duration: request.preRoll + highlightDuration + request.postRoll,
            success: false,
            error: msg
          })
        }
      }

      // Step 10: Cleanup (also handled by finally)


      const successCount = clips.filter((c) => c.success).length
      this.reportProgress('done', 100, request.highlights.length, request.highlights.length, 'done',
        `Recording complete: ${successCount}/${request.highlights.length} clips`)

      return { success: successCount > 0, clips }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Recording failed'
      this.reportProgress('error', 0, 0, request.highlights.length, 'error', message)
      return { success: false, clips, error: message }
    } finally {
      await this.cleanup()
    }
  }

  cancel(): void {
    this.isCancelled = true
    // Stop OBS recording if active
    if (this.obsRecordingActive) {
      this.obsService?.stopRecording().catch(() => {})
      this.obsRecordingActive = false
    }
    this.obsService?.disconnect().catch(() => {})
    this.demoLauncher?.terminate()
    this.consoleWatcher?.stop()
  }

  /**
   * Wait for CS2 to reach the main menu (engine fully initialized, console accepts commands).
   * Detected via Host_WriteConfiguration in console.log which fires after autoexec is written.
   */
  private async waitForCs2Ready(cs2Path: string): Promise<{ timedOut: boolean }> {
    return new Promise<{ timedOut: boolean }>((resolve) => {
      const logPath = path.join(cs2Path, 'game', 'csgo', 'console.log')
      let resolved = false
      const t0 = Date.now()

      const watcher = new ConsoleLogWatcher(logPath, (event) => {
        if (event.type === 'cs2-ready' && !resolved) {
          resolved = true
          watcher.stop()
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
          console.log(`[Orchestrator] CS2 ready detected after ${elapsed}s`)
          resolve({ timedOut: false })
        }
        if (event.type === 'error' && !resolved) {
          console.warn(`[Orchestrator] CS2 ready watch error: ${event.data}`)
        }
      })

      this.consoleWatcher = watcher
      watcher.start()

      // Timeout fallback: 60s for CS2 cold start
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          watcher.stop()
          console.warn(`[Orchestrator] CS2 ready timed out after 60s`)
          resolve({ timedOut: true })
        }
      }, 60_000)
    })
  }

  private async waitForDemoLoad(cs2Path: string): Promise<{ timedOut: boolean }> {
    return new Promise<{ timedOut: boolean }>((resolve) => {
      const logPath = path.join(cs2Path, 'game', 'csgo', 'console.log')
      let resolved = false
      const t0 = Date.now()

      const watcher = new ConsoleLogWatcher(logPath, (event) => {
        if (event.type === 'demo-loaded' && !resolved) {
          resolved = true
          watcher.stop()
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
          console.log(`[Orchestrator] Demo loaded detected after ${elapsed}s`)
          resolve({ timedOut: false })
        }
        if (event.type === 'error' && !resolved) {
          console.warn(`[Orchestrator] console.log watch error: ${event.data}`)
        }
      })

      this.consoleWatcher = watcher
      watcher.start()

      setTimeout(() => {
        if (!resolved) {
          resolved = true
          watcher.stop()
          console.warn(`[Orchestrator] Demo load timed out after ${DEMO_LOAD_TIMEOUT_MS / 1000}s`)
          resolve({ timedOut: true })
        }
      }, DEMO_LOAD_TIMEOUT_MS)
    })
  }

  private calculateTotalDuration(request: RecordingRequest): number {
    let total = 0
    for (const hl of request.highlights) {
      const highlightDuration = (hl.tickEnd - hl.tickStart) / request.tickRate
      total += request.preRoll + highlightDuration + request.postRoll
    }
    return total + BUFFER_SEC
  }

  private buildTimestamps(request: RecordingRequest): Array<{
    id: string
    startSec: number
    durationSec: number
    outputName: string
  }> {
    const timestamps: Array<{ id: string; startSec: number; durationSec: number; outputName: string }> = []
    let offset = 0

    for (const hl of request.highlights) {
      const highlightDuration = (hl.tickEnd - hl.tickStart) / request.tickRate
      const duration = request.preRoll + highlightDuration + request.postRoll
      const clipName = `${hl.playerName}_${hl.type}_R${hl.round}_${hl.id}.mp4`

      timestamps.push({
        id: hl.id,
        startSec: offset,
        durationSec: duration,
        outputName: clipName
      })

      offset += duration
    }

    return timestamps
  }

  private async waitWithProgress(seconds: number, totalHighlights: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = Date.now()
      const totalMs = seconds * 1000

      const interval = setInterval(() => {
        if (this.isCancelled) {
          clearInterval(interval)
          resolve()
          return
        }

        const elapsed = Date.now() - startTime
        const percent = Math.min(100, (elapsed / totalMs) * 100)
        // Map recording progress to 30-70% range
        const overallPercent = 30 + (percent * 0.4)

        const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000))
        this.reportProgress('recording', overallPercent, 0, totalHighlights, 'recording',
          `Recording... ${remaining}s remaining`)

        if (elapsed >= totalMs) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    })
  }

  private async cleanup(): Promise<void> {
    if (this.cleanedUp) return
    this.cleanedUp = true

    // Stop OBS recording if active
    if (this.obsRecordingActive && this.obsService?.isConnected) {
      try {
        await this.obsService.stopRecording()
      } catch {
        // ignore
      }
      this.obsRecordingActive = false
    }

    // Disconnect OBS
    try {
      await this.obsService?.disconnect()
    } catch {
      // ignore
    }

    // Terminate CS2
    try {
      await this.demoLauncher?.terminate()
    } catch {
      // ignore
    }

    // Stop console watcher
    try {
      await this.consoleWatcher?.stop()
    } catch {
      // ignore
    }

    // Delete our custom CFG file (not autoexec.cfg, so no restore needed)
    if (this.autoexecPath) {
      try {
        await fs.unlink(this.autoexecPath)
      } catch {
        // ignore
      }
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
