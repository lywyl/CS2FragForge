export type RecordingStatus =
  | 'idle'
  | 'preparing'
  | 'connecting-obs'
  | 'configuring-obs'
  | 'launching-cs2'
  | 'waiting-load'
  | 'loading-demo'
  | 'preparing-record'
  | 'recording'
  | 'stopping'
  | 'splitting'
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

export interface KillDetail {
  tick: number
  victimName: string
  victimSteamId: string  // SteamID64 as string to avoid JS precision loss
  victimUserId: number  // spec_player slot for victim
  weapon: string
  headshot: boolean
}

export interface RecordingHighlight {
  id: string
  playerName: string
  playerSteamId: string  // SteamID64 as string to avoid JS precision loss
  playerUserId: number
  tickStart: number
  tickEnd: number
  round: number
  type: string
  score: number
  killTicks?: number[]     // 每次击杀的 tick，用于智能跳跃录制 (kill-centric ±3s)
  killDetails?: KillDetail[]  // 每次击杀的受害者信息，用于 POV 回放
  preRollOverride?: number
  postRollOverride?: number
  disableJumpCuts?: boolean
}

export interface ObsConfig {
  host: string
  port: number
  password?: string
}

export interface RecordingRequest {
  demoPath: string
  highlights: RecordingHighlight[]
  cs2Path: string
  preRoll: number
  postRoll: number
  tickRate: number
  outputDir?: string
  obsConfig: ObsConfig
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
