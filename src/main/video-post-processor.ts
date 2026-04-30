import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

export interface HighlightTimestamp {
  id: string
  startSec: number
  durationSec: number
  outputName: string
}

/**
 * Split a single OBS recording into multiple clips by timestamps using FFmpeg.
 * Uses -ss before -i for fast seeking and -c copy (no re-encode) for speed.
 */
export async function splitVideo(
  sourcePath: string,
  highlights: HighlightTimestamp[],
  outputDir: string,
  ffmpegPath: string
): Promise<string[]> {
  await fs.mkdir(outputDir, { recursive: true })

  const outputPaths: string[] = []

  for (const highlight of highlights) {
    const outputPath = path.join(outputDir, highlight.outputName)

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-ss', String(highlight.startSec),
        '-i', sourcePath,
        '-t', String(highlight.durationSec),
        '-c', 'copy',
        outputPath
      ]

      const proc = spawn(ffmpegPath, args)
      let stderr = ''

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`FFmpeg split failed for highlight "${highlight.id}": ${stderr}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`FFmpeg spawn failed for highlight "${highlight.id}": ${err.message}`))
      })
    })

    outputPaths.push(outputPath)
  }

  return outputPaths
}

/**
 * Delete the single large OBS recording file after successful splitting.
 */
export async function cleanupObsRecording(sourcePath: string): Promise<void> {
  try {
    await fs.unlink(sourcePath)
  } catch {
    // file may not exist
  }
}

/**
 * Delete a leftover .cfg file (e.g., autoexec.cfg written for startmovie).
 */
export async function cleanupCfgFile(cfgPath: string): Promise<void> {
  try {
    await fs.unlink(cfgPath)
  } catch {
    // file may not exist
  }
}
