import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let ffmpegPath: string | null = null
let ffprobePath: string | null = null

export function getFfmpegPath(): string {
  if (ffmpegPath) return ffmpegPath

  if (app.isPackaged) {
    // In packaged app, ffmpeg is in asar-unpacked
    const unpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffmpeg-static',
      'ffmpeg.exe'
    )
    if (fs.existsSync(unpackedPath)) {
      ffmpegPath = unpackedPath
      return ffmpegPath
    }
  }

  // Development mode: use ffmpeg-static directly
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ffmpegPath = require('ffmpeg-static') as string
    return ffmpegPath
  } catch {
    throw new Error('ffmpeg-static not found. Run: npm install ffmpeg-static')
  }
}

export function getFfprobePath(): string {
  if (ffprobePath) return ffprobePath

  if (app.isPackaged) {
    // Check for ffprobe-static in asar-unpacked
    const unpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffprobe-static',
      'ffprobe.exe'
    )
    if (fs.existsSync(unpackedPath)) {
      ffprobePath = unpackedPath
      return ffprobePath
    }

    // Fallback: look next to ffmpeg
    const ffmpeg = getFfmpegPath()
    const dir = path.dirname(ffmpeg)
    const ffprobeNextToFFmpeg = path.join(dir, 'ffprobe.exe')
    if (fs.existsSync(ffprobeNextToFFmpeg)) {
      ffprobePath = ffprobeNextToFFmpeg
      return ffprobePath
    }
  }

  // Development mode: try ffprobe-static
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobeModule = require('ffprobe-static') as { path: string }
    ffprobePath = ffprobeModule.path
    return ffprobePath
  } catch {
    // Fallback: try to find ffprobe next to ffmpeg
    const ffmpeg = getFfmpegPath()
    const dir = path.dirname(ffmpeg)
    const ffprobeNextToFFmpeg = path.join(dir, 'ffprobe.exe')
    if (fs.existsSync(ffprobeNextToFFmpeg)) {
      ffprobePath = ffprobeNextToFFmpeg
      return ffprobePath
    }

    throw new Error('ffprobe not found. Install ffprobe-static or place ffprobe.exe next to ffmpeg.')
  }
}
