import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import type { MergeVideoSegment, MergeProgress, MergeResult } from '../shared/merge-types'

interface VideoProbe {
  path: string
  name: string
  duration: number
  codec: string
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

export class VideoMergeService {
  private currentCommand: ffmpeg.FfmpegCommand | null = null
  private tempDir: string | null = null
  private isCancelled = false

  constructor(
    private ffmpegPath: string,
    private ffprobePath: string,
    private onProgress: (progress: MergeProgress) => void
  ) {
    ffmpeg.setFfmpegPath(this.ffmpegPath)
    ffmpeg.setFfprobePath(this.ffprobePath)
  }

  async merge(videoPaths: string[]): Promise<MergeResult> {
    if (videoPaths.length === 0) {
      return { success: false, error: 'No videos to merge' }
    }
    if (videoPaths.length === 1) {
      // Single video — no merge needed, just probe for duration
      const probe = await this.probeVideo(videoPaths[0])
      return {
        success: true,
        mergedPath: videoPaths[0],
        segments: [{
          sourcePath: videoPaths[0],
          name: probe.name,
          duration: probe.duration,
          mergedOffset: 0
        }]
      }
    }

    this.isCancelled = false
    this.tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cs2merge-'))

    this.reportProgress('pending', 0, 'Probing videos...', 1, 3)

    try {
      // Step 1: Probe all videos
      const probes: VideoProbe[] = []
      for (let i = 0; i < videoPaths.length; i++) {
        if (this.isCancelled) throw new Error('Merge cancelled')
        const probe = await this.probeVideo(videoPaths[i])
        probes.push(probe)
        this.reportProgress('merging',
          Math.round(((i + 1) / videoPaths.length) * 20),
          `Probing video ${i + 1}/${videoPaths.length}`,
          1, 3)
      }

      // Build segments with cumulative offsets
      const segments: MergeVideoSegment[] = []
      let offset = 0
      for (const probe of probes) {
        segments.push({
          sourcePath: probe.path,
          name: probe.name,
          duration: probe.duration,
          mergedOffset: offset
        })
        offset += probe.duration
      }

      // Step 2: Check compatibility
      this.reportProgress('merging', 25, 'Checking compatibility...', 2, 3)
      const compatible = this.checkCompatibility(probes)
      const totalSteps = 3
      const currentStep = 2

      // Step 3: Concatenate
      let mergedPath: string
      if (compatible) {
        this.reportProgress('merging', 30, 'Merging (fast copy)...', currentStep, totalSteps)
        mergedPath = await this.concatDemuxer(videoPaths, probes)
      } else {
        this.reportProgress('merging', 30, 'Merging (re-encoding for compatibility)...', currentStep, totalSteps)
        mergedPath = await this.concatReencode(videoPaths, probes)
      }

      this.reportProgress('done', 100, 'Merge complete!', totalSteps, totalSteps)
      return { success: true, mergedPath, segments }

    } catch (err) {
      if (this.isCancelled) {
        this.reportProgress('cancelled', 0, 'Merge cancelled', 0, 0)
        return { success: false, error: 'Merge cancelled' }
      }
      const message = err instanceof Error ? err.message : 'Merge failed'
      this.reportProgress('error', 0, message, 0, 0)
      return { success: false, error: message }
    } finally {
      await this.cleanup()
    }
  }

  cancel(): void {
    this.isCancelled = true
    if (this.currentCommand) {
      try { this.currentCommand.kill('SIGKILL') } catch { /* ignore */ }
      this.currentCommand = null
    }
  }

  private reportProgress(
    status: MergeProgress['status'],
    percent: number,
    stepLabel: string,
    currentStep: number,
    totalSteps: number
  ): void {
    this.onProgress({ status, percent, stepLabel, currentStep, totalSteps })
  }

  private probeVideo(filePath: string): Promise<VideoProbe> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe ${path.basename(filePath)}: ${err.message}`))
          return
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio')

        if (!videoStream) {
          reject(new Error(`No video stream found in ${path.basename(filePath)}`))
          return
        }

        // Parse frame rate from r_frame_rate (e.g., "30/1" or "30000/1001")
        let fps = 30
        if (videoStream.r_frame_rate) {
          const parts = String(videoStream.r_frame_rate).split('/')
          if (parts.length === 2 && parseInt(parts[1]) > 0) {
            fps = Math.round(parseInt(parts[0]) / parseInt(parts[1]))
          }
        }

        resolve({
          path: filePath,
          name: path.basename(filePath),
          duration: metadata.format.duration || 0,
          codec: videoStream.codec_name || '',
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps,
          hasAudio: !!audioStream
        })
      })
    })
  }

  private checkCompatibility(probes: VideoProbe[]): boolean {
    if (probes.length < 2) return true
    const first = probes[0]
    for (let i = 1; i < probes.length; i++) {
      const p = probes[i]
      if (p.codec !== first.codec) return false
      if (p.width !== first.width || p.height !== first.height) return false
      if (Math.abs(p.fps - first.fps) > 2) return false
    }
    return true
  }

  private concatDemuxer(videoPaths: string[], probes: VideoProbe[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir!, 'merged.mp4')
      const listPath = path.join(this.tempDir!, 'concat_list.txt')

      // Write concat list file with escaped paths
      const listContent = videoPaths
        .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
        .join('\n')
      fs.writeFileSync(listPath, listContent, 'utf-8')

      const totalDuration = probes.reduce((sum, p) => sum + p.duration, 0)

      const cmd = ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-fflags', '+genpts'])
        .output(outputPath)

      this.currentCommand = cmd

      cmd.on('progress', (progress) => {
        if (this.isCancelled) return
        const percent = totalDuration > 0
          ? Math.min(95, Math.round(((progress.timemark ? this.parseTimemark(progress.timemark) : 0) / totalDuration) * 100))
          : Math.min(95, (progress.percent || 0))
        this.reportProgress('merging', 30 + Math.round(percent * 0.65),
          `Merging... ${percent}%`, 2, 3)
      })

      cmd.on('end', () => {
        this.currentCommand = null
        resolve(outputPath)
      })

      cmd.on('error', (err) => {
        this.currentCommand = null
        if (this.isCancelled) {
          reject(new Error('Merge cancelled'))
        } else {
          reject(new Error(`FFmpeg concat failed: ${err.message}`))
        }
      })

      cmd.run()
    })
  }

  private concatReencode(videoPaths: string[], probes: VideoProbe[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir!, 'merged.mp4')
      const hasAudio = probes.some(p => p.hasAudio)
      const n = videoPaths.length

      // Build complex filter for concat
      const filterParts: string[] = []
      for (let i = 0; i < n; i++) {
        filterParts.push(`[${i}:v:0]`)
        if (hasAudio) filterParts.push(`[${i}:a:0]`)
      }
      const concatFilter = `${filterParts.join('')}concat=n=${n}:v=1:a=${hasAudio ? 1 : 0}[outv]${hasAudio ? '[outa]' : ''}`

      const cmd = ffmpeg()
      for (const p of videoPaths) {
        cmd.input(p)
      }

      const outputOptions = [
        '-filter_complex', concatFilter,
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
      ]
      if (hasAudio) {
        outputOptions.push('-map', '[outa]', '-c:a', 'aac', '-b:a', '192k')
      }
      outputOptions.push('-movflags', '+faststart')

      cmd.outputOptions(outputOptions).output(outputPath)

      this.currentCommand = cmd

      const totalDuration = probes.reduce((sum, p) => sum + p.duration, 0)

      cmd.on('progress', (progress) => {
        if (this.isCancelled) return
        const percent = totalDuration > 0
          ? Math.min(95, Math.round(((progress.timemark ? this.parseTimemark(progress.timemark) : 0) / totalDuration) * 100))
          : Math.min(95, (progress.percent || 0))
        this.reportProgress('merging', 30 + Math.round(percent * 0.65),
          `Re-encoding... ${percent}%`, 2, 3)
      })

      cmd.on('end', () => {
        this.currentCommand = null
        resolve(outputPath)
      })

      cmd.on('error', (err) => {
        this.currentCommand = null
        if (this.isCancelled) {
          reject(new Error('Merge cancelled'))
        } else {
          reject(new Error(`FFmpeg re-encode failed: ${err.message}`))
        }
      })

      cmd.run()
    })
  }

  private parseTimemark(tm: string): number {
    const parts = tm.split(':')
    if (parts.length !== 3) return 0
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
  }

  private async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        // Only clean up the concat list file, keep the merged output
        const listPath = path.join(this.tempDir, 'concat_list.txt')
        if (fs.existsSync(listPath)) {
          await fs.promises.unlink(listPath)
        }
      } catch { /* ignore */ }
    }
  }
}
