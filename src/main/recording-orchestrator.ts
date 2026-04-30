import path from 'path'
import { DemoLauncher } from './demo-launcher'
import { ConsoleLogWatcher } from './console-log-watcher'
import { writeHighlightCfg } from './cfg-writer'
import { VideoPostProcessor } from './video-post-processor'
import type {
  RecordingRequest,
  RecordingResult,
  RecordingClipResult,
  RecordingProgress,
  RecordingStatus,
  HighlightRecordingStatus,
  RecordingHighlight
} from '../shared/recording-types'

export class RecordingOrchestrator {
  private isCancelled = false
  private demoLauncher: DemoLauncher | null = null
  private consoleWatcher: ConsoleLogWatcher | null = null
  private cfgFiles: string[] = []

  constructor(private onProgress: (progress: RecordingProgress) => void) {}

  async record(request: RecordingRequest): Promise<RecordingResult> {
    if (request.highlights.length === 0) {
      throw new Error('No highlights to record')
    }

    this.isCancelled = false
    const clips: RecordingClipResult[] = []

    this.reportProgress('preparing', 0, 0, request.highlights.length, 'preparing', 'Preparing recording...')

    try {
      // Copy demo to CS2 replays directory
      this.demoLauncher = new DemoLauncher(request.cs2Path)
      const demoName = await this.demoLauncher.copyDemoToReplays(request.demoPath)

      const cfgDir = path.join(request.cs2Path, 'game', 'csgo', 'cfg')
      const outputDir = request.outputDir ?? path.join(path.dirname(request.demoPath), 'clips')

      for (let i = 0; i < request.highlights.length; i++) {
        if (this.isCancelled) break

        const highlight = request.highlights[i]
        const clip = await this.recordSingleHighlight(
          highlight,
          i,
          request.highlights.length,
          request,
          demoName,
          cfgDir,
          outputDir
        )
        clips.push(clip)
      }

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
    this.demoLauncher?.terminate()
    this.consoleWatcher?.stop()
  }

  private async recordSingleHighlight(
    highlight: RecordingHighlight,
    index: number,
    total: number,
    request: RecordingRequest,
    demoName: string,
    cfgDir: string,
    outputDir: string
  ): Promise<RecordingClipResult> {
    const highlightLabel = `${highlight.playerName} - ${highlight.type} - Round ${highlight.round}`

    try {
      // Step 1: Generate CFG — this file will be exec'd after demo loads
      this.reportProgress('preparing', this.percent(index, total), index + 1, total, 'preparing',
        `Generating recording config for: ${highlightLabel}`)

      const movieFilename = `cs2fragforge_${highlight.id}`
      const cfgName = `cs2fragforge_${highlight.id}.cfg`
      const cfgPath = await writeHighlightCfg({
        tickStart: highlight.tickStart,
        tickRate: request.tickRate,
        playerName: highlight.playerName,
        preRoll: request.preRoll,
        highlightId: highlight.id,
        movieFilename
      }, cfgDir)
      this.cfgFiles.push(cfgPath)

      // Step 2: Launch CS2 with +playdemo and +exec (CFG runs after demo loads via Source 2 command queue)
      this.reportProgress('launching-cs2', this.percent(index, total), index + 1, total, 'launching',
        `Starting CS2 (${index + 1}/${total}): ${highlightLabel}`)

      await this.demoLauncher!.launch(demoName, cfgName)

      // Step 3: Wait for demo to load (console.log monitoring)
      this.reportProgress('waiting-load', this.percent(index, total), index + 1, total, 'loading',
        `Waiting for CS2 to load demo (${index + 1}/${total}): ${highlightLabel}`)

      const loadResult = await this.waitForDemoLoad(request.cs2Path)

      if (this.isCancelled) {
        return { highlightId: highlight.id, outputPath: '', duration: 0, success: false, error: 'Cancelled' }
      }

      // Step 3.5: Safety fallback — send exec via stdin in case +exec didn't fire.
      // If demo load timed out, the CFG may not have executed; stdin injection is our backup.
      await new Promise((r) => setTimeout(r, 1000))
      this.demoLauncher!.sendCommand(`exec ${cfgName}`)
      if (loadResult.timedOut) {
        console.warn('[Orchestrator] Injected exec via stdin after demo load timeout')
      }

      // Step 4: Wait for recording duration
      const highlightDuration = (highlight.tickEnd - highlight.tickStart) / request.tickRate
      const totalDuration = request.preRoll + highlightDuration + request.postRoll

      this.reportProgress('recording', this.percent(index, total), index + 1, total, 'recording',
        `Recording clip ${index + 1}/${total}: ${highlightLabel} (${Math.ceil(totalDuration)}s)`)

      await this.waitWithProgress(totalDuration, index, total, request.highlights.length)

      if (this.isCancelled) {
        return { highlightId: highlight.id, outputPath: '', duration: 0, success: false, error: 'Cancelled' }
      }

      // Step 5: Stop recording (terminate CS2)
      this.reportProgress('stopping', this.percent(index, total), index + 1, total, 'stopping',
        `Stopping CS2 and saving clip ${index + 1}/${total}: ${highlightLabel}`)

      await this.demoLauncher!.terminate()

      // Wait for CS2 to fully exit and flush file
      this.reportProgress('stopping', this.percent(index, total), index + 1, total, 'stopping',
        `Waiting for CS2 to save video file (${index + 1}/${total})...`)
      await new Promise((r) => setTimeout(r, 3000))

      // Step 6: Move output file
      this.reportProgress('stopping', this.percent(index, total), index + 1, total, 'stopping',
        `Processing video file (${index + 1}/${total}): ${highlightLabel}`)
      const clipName = `${highlight.playerName}_${highlight.type}_R${highlight.round}_${highlight.id}.mp4`
      const outputPath = await VideoPostProcessor.finalizeVideo(
        request.cs2Path, movieFilename, outputDir, clipName
      )

      // Cleanup CFG
      await VideoPostProcessor.cleanupCfgFile(cfgPath)
      this.cfgFiles = this.cfgFiles.filter((f) => f !== cfgPath)

      if (!outputPath) {
        return {
          highlightId: highlight.id,
          outputPath: '',
          duration: totalDuration,
          success: false,
          error: 'Output file not found after recording — startmovie may not have run. Check that CS2 supports startmovie h264.'
        }
      }

      return {
        highlightId: highlight.id,
        outputPath,
        duration: totalDuration,
        success: true
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return {
        highlightId: highlight.id,
        outputPath: '',
        duration: 0,
        success: false,
        error: message
      }
    }
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

      // Timeout fallback: 45s (generous for slow machines loading CS2 + demo)
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          watcher.stop()
          console.warn('[Orchestrator] Demo load timed out after 45s — proceeding anyway')
          resolve({ timedOut: true })
        }
      }, 45000)
    })
  }

  private async waitWithProgress(
    seconds: number,
    highlightIndex: number,
    total: number,
    totalHighlights: number
  ): Promise<void> {
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
        const highlightPercent = Math.min(100, (elapsed / totalMs) * 100)
        const overallPercent = ((highlightIndex + highlightPercent / 100) / total) * 100

        const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000))
        this.reportProgress('recording', overallPercent, highlightIndex + 1, totalHighlights, 'recording',
          `Recording... ${remaining}s remaining`)

        if (elapsed >= totalMs) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    })
  }

  private async cleanup(): Promise<void> {
    try {
      await this.demoLauncher?.terminate()
    } catch {
      // ignore
    }

    try {
      await this.consoleWatcher?.stop()
    } catch {
      // ignore
    }

    for (const cfgPath of this.cfgFiles) {
      try {
        await VideoPostProcessor.cleanupCfgFile(cfgPath)
      } catch {
        // ignore
      }
    }
    this.cfgFiles = []
  }

  private percent(index: number, total: number): number {
    return Math.round((index / total) * 100)
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
      percent,
      currentHighlight,
      totalHighlights,
      highlightStatus,
      stepLabel
    })
  }
}
