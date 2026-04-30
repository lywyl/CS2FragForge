export interface ExportSettings {
  outputFormat: 'mp4' | 'mkv'
  videoCodec: 'libx264' | 'libx265'
  audioCodec: 'aac' | 'copy'
  crf: number
  resolution: 'source' | '1080p' | '720p' | '480p'
  audioBitrate: string
}

export type ExportStatus =
  | 'idle'
  | 'trimming'
  | 'concatenating'
  | 'mixing'
  | 'done'
  | 'error'
  | 'cancelled'

export interface ExportProgress {
  status: ExportStatus
  percent: number
  currentStep: number
  totalSteps: number
  stepLabel: string
  eta?: string
}

export interface ExportRequest {
  clips: Array<{
    sourcePath: string
    startSec: number
    endSec: number
    volume: number
  }>
  audioTracks: Array<{
    sourcePath: string
    volume: number
    startSec: number
    endSec: number
  }>
  outputPath: string
  settings: ExportSettings
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  outputFormat: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  crf: 22,
  resolution: 'source',
  audioBitrate: '192k'
}
