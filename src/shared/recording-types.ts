export type RecordingStatus =
  | 'idle'
  | 'preparing'
  | 'launching-cs2'
  | 'waiting-load'
  | 'recording'
  | 'stopping'
  | 'done'
  | 'error'
  | 'cancelled'

export type HighlightRecordingStatus =
  | 'pending'
  | 'preparing'
  | 'launching'
  | 'loading'
  | 'recording'
  | 'stopping'
  | 'done'
  | 'error'
  | 'skipped'

export interface RecordingProgress {
  status: RecordingStatus
  percent: number
  currentHighlight: number
  totalHighlights: number
  highlightStatus: HighlightRecordingStatus
  stepLabel: string
  outputPath?: string
  error?: string
}

export interface RecordingHighlight {
  id: string
  playerName: string
  tickStart: number
  tickEnd: number
  round: number
  type: string
  score: number
}

export interface RecordingRequest {
  demoPath: string
  highlights: RecordingHighlight[]
  cs2Path: string
  preRoll: number
  postRoll: number
  tickRate: number
  outputDir?: string
}

export interface RecordingResult {
  success: boolean
  clips: RecordingClipResult[]
  error?: string
}

export interface RecordingClipResult {
  highlightId: string
  outputPath: string
  duration: number
  success: boolean
  error?: string
}
