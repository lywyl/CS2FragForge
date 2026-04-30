import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

export class VideoPostProcessor {
  /**
   * Get candidate output paths for startmovie in CS2.
   * CS2 may output to different locations depending on the engine version.
   */
  static getCandidatePaths(cs2Path: string, movieFilename: string): string[] {
    const base = movieFilename
    // startmovie may output with different extensions based on codec
    const extensions = ['.mp4', '.avi', '.mkv', '.webm']
    // Possible output directories (CS2's startmovie behavior varies)
    const dirs = [
      path.join(cs2Path, 'game'),
      path.join(cs2Path, 'game', 'csgo'),
      path.join(cs2Path, 'game', 'bin', 'win64')
    ]

    const paths: string[] = []
    for (const dir of dirs) {
      for (const ext of extensions) {
        paths.push(path.join(dir, `${base}${ext}`))
      }
      // Also try without extension (raw frames mode)
      paths.push(path.join(dir, base))
    }
    return paths
  }

  static getMovieOutputPath(cs2Path: string, movieFilename: string): string {
    // Primary expected path (most common for CS2 startmovie h264)
    return path.join(cs2Path, 'game', `${movieFilename}.mp4`)
  }

  /**
   * Find the actual output file CS2 produced, searching candidate paths.
   */
  static async findOutputFile(cs2Path: string, movieFilename: string): Promise<string | null> {
    const candidates = this.getCandidatePaths(cs2Path, movieFilename)

    for (const candidate of candidates) {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        continue
      }
    }
    return null
  }

  static async finalizeVideo(
    cs2Path: string,
    movieFilename: string,
    outputDir: string,
    outputName: string
  ): Promise<string | null> {
    // Wait for CS2 to fully flush and release the output file
    let sourcePath: string | null = null
    for (let i = 0; i < 15; i++) {
      sourcePath = await this.findOutputFile(cs2Path, movieFilename)
      if (sourcePath) {
        // Check file is not empty and not locked (size stable across two reads)
        try {
          const stat1 = fsSync.statSync(sourcePath)
          await new Promise((r) => setTimeout(r, 500))
          const stat2 = fsSync.statSync(sourcePath)
          if (stat1.size === stat2.size && stat1.size > 0) {
            break
          }
          if (stat1.size === 0) {
            sourcePath = null // still writing
          }
        } catch {
          sourcePath = null
        }
      }
      await new Promise((r) => setTimeout(r, 1000))
    }

    if (!sourcePath) {
      return null
    }

    await fs.mkdir(outputDir, { recursive: true })
    const outputPath = path.join(outputDir, outputName)
    await fs.rename(sourcePath, outputPath)

    // Clean up any leftover candidate files (e.g., WAV audio sidecar from startmovie)
    await this.cleanupLeftovers(cs2Path, movieFilename)

    return outputPath
  }

  /**
   * Clean up leftover files from startmovie (e.g., separate .wav audio tracks).
   */
  static async cleanupLeftovers(cs2Path: string, movieFilename: string): Promise<void> {
    const candidates = this.getCandidatePaths(cs2Path, movieFilename)
    // Also check for .wav audio sidecar
    const wavPath = path.join(cs2Path, 'game', `${movieFilename}.wav`)
    const csgoWavPath = path.join(cs2Path, 'game', 'csgo', `${movieFilename}.wav`)

    for (const p of [...candidates, wavPath, csgoWavPath]) {
      try {
        await fs.unlink(p)
      } catch {
        // ignore
      }
    }
  }

  static async cleanupMovieFile(cs2Path: string, movieFilename: string): Promise<void> {
    const sourcePath = await this.findOutputFile(cs2Path, movieFilename)
    if (sourcePath) {
      try {
        await fs.unlink(sourcePath)
      } catch {
        // file may not exist
      }
    }
  }

  static async cleanupCfgFile(cfgPath: string): Promise<void> {
    try {
      await fs.unlink(cfgPath)
    } catch {
      // file may not exist
    }
  }
}
