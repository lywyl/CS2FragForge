export type HighlightType = '3K' | '4K' | 'ACE' | 'CLUTCH' | 'ECO_WIN' | 'CUSTOM'

export interface Highlight {
  id: string
  type: HighlightType
  playerName: string
  playerSteamId: number
  round: number
  tickStart: number
  tickEnd: number
  killCount: number
  weapons: string[]
  score: number
  headshotCount?: number
  selected?: boolean
}

export interface Clip {
  id: string
  sourcePath: string
  startSec: number
  endSec: number
  timelineStart: number
  timelineEnd: number
  volume: number
}

export interface AudioTrack {
  id: string
  sourcePath: string
  volume: number
  startSec: number
  endSec: number
}

export interface GameInfo {
  mapName: string
  tickRate: number
  totalCountedRounds: number
  players: PlayerInfo[]
}

export interface PlayerInfo {
  name: string
  steamId: number
  team: string
  kills: number
  deaths: number
}

export interface Project {
  id: string
  demoPath: string
  demoName: string
  cs2InstallPath: string
  name: string
  createdAt: number
  highlights: Highlight[]
  clips: Clip[]
  audioTracks: AudioTrack[]
  gameInfo: GameInfo | null
  status: 'empty' | 'parsing' | 'parsed' | 'recording' | 'recorded' | 'edited' | 'exported' | 'error'
  error: string | null
  sourceVideoPath?: string
}

export type ProjectStatus = Project['status']