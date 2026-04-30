import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ExportRequest, ExportProgress, ExportSettings } from '../shared/export-types'

export class ExportService {
  private currentCommand: ffmpeg.FfmpegCommand | null = null
  private tempDir: string | null = null
  private isCancelled = false
  private progressTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private ffmpegPath: string,
    private ffprobePath: string,
    private onProgress: (progress: ExportProgress) => void
  ) {
    ffmpeg.setFfmpegPath(this.ffmpegPath)
    ffmpeg.setFfprobePath(this.ffprobePath)
  }

  async export(request: ExportRequest): Promise<string> {
    if (request.clips.length === 0) {
      throw new Error('No clips to export')
    }

    this.isCancelled = false
    this.tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cs2cutter-'))

    const hasAudio = request.audioTracks.length > 0
    const needsConcat = request.clips.length > 1
    const totalSteps = request.clips.length + (needsConcat ? 1 : 0) + (hasAudio ? 1 : 0)

    try {
      // Step 1: Trim each clip
      const trimmedPaths: string[] = []
      for (let i = 0; i < request.clips.length; i++) {
        if (this.isCancelled) throw new Error('Export cancelled')
        const clip = request.clips[i]
        const outputPath = path.join(this.tempDir, `clip_${i}.mp4`)
        await this.trimClip(clip, i, request.clips.length, totalSteps, request.settings)
        trimmedPaths.push(outputPath)
      }

      // Step 2: Concatenate (skip if single clip)
      let videoPath: string
      if (needsConcat) {
        if (this.isCancelled) throw new Error('Export cancelled')
        videoPath = await this.concatClips(trimmedPaths, totalSteps, request.clips.length)
      } else {
        videoPath = trimmedPaths[0]
      }

      // Step 3: Mix audio (if audio tracks exist)
      if (hasAudio) {
        if (this.isCancelled) throw new Error('Export cancelled')
        videoPath = await this.mixAudio(
          videoPath,
          request.audioTracks,
          totalSteps,
          request.clips.length + (needsConcat ? 1 : 0),
          request.settings
        )
      }

      // Move to output path
      await fs.promises.copyFile(videoPath, request.outputPath)

      this.onProgress({
        status: 'done',
        percent: 100,
        currentStep: totalSteps,
        totalSteps,
        stepLabel: 'Export complete'
      })

      return request.outputPath
    } catch (err) {
      if (this.isCancelled) {
        this.onProgress({
          status: 'cancelled',
          percent: 0,
          currentStep: 0,
          totalSteps,
          stepLabel: 'Export cancelled'
        })
        throw new Error('Export cancelled')
      }
      throw err
    } finally {
      await this.cleanup()
    }
  }

  cancel(): void {
    this.isCancelled = true
    if (this.currentCommand) {
      this.currentCommand.kill('SIGKILL')
      this.currentCommand = null
    }
  }

  private trimClip(
    clip: ExportRequest['clips'][0],
    index: number,
    totalClips: number,
    totalSteps: number,
    settings: ExportSettings
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir!, `clip_${index}.mp4`)
      const duration = clip.endSec - clip.startSec

      const resolutionArgs = this.buildResolutionArgs(settings.resolution)

      // Watchdog: if no progress for 60s, assume stuck and fail
      let lastProgressTime = Date.now()
      const watchdog = setInterval(() => {
        if (this.isCancelled) return
        if (Date.now() - lastProgressTime > 60_000) {
          clearInterval(watchdog)
          this.cancel()
          reject(new Error('Export stuck: no progress for 60 seconds. Check that ffmpeg and ffprobe are working correctly.'))
        }
      }, 5000)

      const command = ffmpeg(clip.sourcePath)
        .setStartTime(clip.startSec)
        .setDuration(duration)
        .outputOptions([
          '-c:v', settings.videoCodec,
          '-crf', String(settings.crf),
          '-preset', 'fast',
          '-c:a', settings.audioCodec === 'copy' ? 'copy' : 'aac',
          '-b:a', settings.audioCodec === 'copy' ? undefined : settings.audioBitrate,
          '-async', '1'
        ].filter(Boolean) as string[])
        .output(outputPath)

      if (resolutionArgs.length > 0) {
        command.outputOptions(resolutionArgs)
      }

      command
        .on('progress', (progress) => {
          lastProgressTime = Date.now()
          // fluent-ffmpeg percent may be undefined/-1; fall back to timemark
          let stepPercent = progress.percent ?? -1
          if (stepPercent < 0 && progress.timemark && duration > 0) {
            const parts = progress.timemark.split(':').map(Number)
            const elapsed = parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
            stepPercent = Math.min((elapsed / duration) * 100, 100)
          }
          if (stepPercent < 0) stepPercent = 0
          const overallPercent = Math.round(((index + stepPercent / 100) / totalSteps) * 100)
          this.onProgress({
            status: 'trimming',
            percent: Math.min(overallPercent, 99),
            currentStep: index + 1,
            totalSteps,
            stepLabel: `Trimming clip ${index + 1}/${totalClips}`,
            eta: progress.timemark
          })
        })
        .on('end', () => {
          clearInterval(watchdog)
          resolve(outputPath)
        })
        .on('error', (err) => {
          clearInterval(watchdog)
          if (this.isCancelled) reject(new Error('Export cancelled'))
          else reject(err)
        })

      this.currentCommand = command
      command.run()
    })
  }

  private concatClips(
    trimmedPaths: string[],
    totalSteps: number,
    trimSteps: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const listPath = path.join(this.tempDir!, 'concat_list.txt')
      const outputPath = path.join(this.tempDir!, 'concatenated.mp4')

      // Write concat list file
      const listContent = trimmedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
      fs.writeFileSync(listPath, listContent, 'utf-8')

      let lastProgressTime = Date.now()
      const watchdog = setInterval(() => {
        if (this.isCancelled) return
        if (Date.now() - lastProgressTime > 60_000) {
          clearInterval(watchdog)
          this.cancel()
          reject(new Error('Export stuck: concatenation no progress for 60 seconds.'))
        }
      }, 5000)

      const command = ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-async', '1', '-fflags', '+genpts'])
        .output(outputPath)

      command
        .on('progress', (progress) => {
          lastProgressTime = Date.now()
          const stepPercent = progress.percent ?? 0
          const overallPercent = Math.round(((trimSteps + stepPercent / 100) / totalSteps) * 100)
          this.onProgress({
            status: 'concatenating',
            percent: Math.min(overallPercent, 99),
            currentStep: trimSteps + 1,
            totalSteps,
            stepLabel: 'Concatenating clips',
            eta: progress.timemark
          })
        })
        .on('end', () => {
          clearInterval(watchdog)
          resolve(outputPath)
        })
        .on('error', (err) => {
          clearInterval(watchdog)
          if (this.isCancelled) reject(new Error('Export cancelled'))
          else reject(err)
        })

      this.currentCommand = command
      command.run()
    })
  }

  private mixAudio(
    videoPath: string,
    audioTracks: ExportRequest['audioTracks'],
    totalSteps: number,
    stepsBeforeMix: number,
    _settings: ExportSettings
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir!, 'mixed.mp4')

      let lastProgressTime = Date.now()
      const watchdog = setInterval(() => {
        if (this.isCancelled) return
        if (Date.now() - lastProgressTime > 60_000) {
          clearInterval(watchdog)
          this.cancel()
          reject(new Error('Export stuck: audio mixing no progress for 60 seconds.'))
        }
      }, 5000)

      const command = ffmpeg(videoPath)

      // Add audio track inputs
      for (const track of audioTracks) {
        command.input(track.sourcePath)
      }

      // Build complex filter
      const filterParts: string[] = []
      // Video audio (index 0:a) with volume from first clip
      const mainVolume = audioTracks[0]?.volume ?? 1
      filterParts.push(`[0:a]volume=${mainVolume}[a0]`)

      for (let i = 0; i < audioTracks.length; i++) {
        filterParts.push(`[${i + 1}:a]volume=${audioTracks[i].volume}[a${i + 1}]`)
      }

      const mixInputs = Array.from({ length: audioTracks.length + 1 }, (_, i) => `[a${i}]`).join('')
      filterParts.push(`${mixInputs}amix=inputs=${audioTracks.length + 1}:duration=first[aout]`)

      command
        .complexFilter(filterParts)
        .outputOptions([
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-async', '1'
        ])
        .output(outputPath)

      command
        .on('progress', (progress) => {
          lastProgressTime = Date.now()
          const stepPercent = progress.percent ?? 0
          const overallPercent = Math.round(((stepsBeforeMix + stepPercent / 100) / totalSteps) * 100)
          this.onProgress({
            status: 'mixing',
            percent: Math.min(overallPercent, 99),
            currentStep: stepsBeforeMix + 1,
            totalSteps,
            stepLabel: 'Mixing audio',
            eta: progress.timemark
          })
        })
        .on('end', () => {
          clearInterval(watchdog)
          resolve(outputPath)
        })
        .on('error', (err) => {
          clearInterval(watchdog)
          if (this.isCancelled) reject(new Error('Export cancelled'))
          else reject(err)
        })

      this.currentCommand = command
      command.run()
    })
  }

  private buildResolutionArgs(resolution: ExportSettings['resolution']): string[] {
    switch (resolution) {
      case '1080p':
        return ['-vf', 'scale=-2:1080']
      case '720p':
        return ['-vf', 'scale=-2:720']
      case '480p':
        return ['-vf', 'scale=-2:480']
      default:
        return []
    }
  }

  private async cleanup(): Promise<void> {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
    if (this.tempDir) {
      try {
        await fs.promises.rm(this.tempDir, { recursive: true, force: true })
      } catch {
        // Best effort cleanup
      }
      this.tempDir = null
    }
    this.currentCommand = null
  }
}
