import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type { ExportRequest, ExportProgress } from '../shared/export-types'
import type { AppSettings } from '../shared/settings-types'
import type { RecordingRequest, RecordingResult, RecordingProgress } from '../shared/recording-types'

export type ElectronAPI = {
  // Python bridge
  pythonStart: () => Promise<void>
  pythonStop: () => Promise<void>
  pythonHealth: () => Promise<boolean>

  // Demo operations
  demoParse: (demoPath: string) => Promise<{
    header: Record<string, unknown>
    events: Record<string, unknown[]>
  }>
  demoDetectHighlights: (demoPath: string) => Promise<
    Array<{
      type: string
      player_name: string
      player_steamid: number
      round: number
      tick_start: number
      tick_end: number
      kill_count: number
      weapons: string[]
      score: number
      headshot_count?: number
    }>
  >
  demoGetGameInfo: (demoPath: string) => Promise<{
    map_name: string
    tick_rate: number
    total_counted_rounds: number
    players: Array<{ name: string; steamid: number; team: string; kills: number; deaths: number }>
  }>

  // Dialog
  openDialog: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>
  openVideoDialog: () => Promise<string | null>

  // CS2 environment
  cs2FindPath: () => Promise<{
    steamPath: string | null
    cs2Path: string | null
    cs2ExePath: string | null
    replaysPath: string | null
    steamUserId: string | null
  } | null>
  cs2ValidatePath: (path: string) => Promise<boolean>

  // Recording
  recordingStart: (request: RecordingRequest) => Promise<RecordingResult>
  recordingStop: () => Promise<void>
  onRecordingProgress: (callback: (progress: RecordingProgress) => void) => () => void

  // OBS
  obsTestConnection: (config: { host: string; port: number; password?: string }) => Promise<{ success: boolean; version?: string; error?: string }>

  // Export
  exportStart: (request: ExportRequest) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  exportCancel: () => Promise<void>
  exportSelectOutput: () => Promise<string | null>
  onExportProgress: (callback: (progress: ExportProgress) => void) => () => void

  // Project persistence
  projectSave: (project: Record<string, unknown>) => Promise<string | null>
  projectLoad: () => Promise<Record<string, unknown> | null>

  // Settings persistence
  settingsGet: () => Promise<AppSettings>
  settingsSet: (settings: Partial<AppSettings>) => Promise<AppSettings>
  settingsReset: () => Promise<AppSettings>

  // File utilities
  getDroppedFilePath: (file: File) => string

  // Window controls
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
}

const electronAPI: ElectronAPI = {
  // Python bridge
  pythonStart: () => ipcRenderer.invoke(IPC_CHANNELS.PYTHON_START),
  pythonStop: () => ipcRenderer.invoke(IPC_CHANNELS.PYTHON_STOP),
  pythonHealth: () => ipcRenderer.invoke(IPC_CHANNELS.PYTHON_HEALTH),

  // Demo operations
  demoParse: (demoPath) => ipcRenderer.invoke(IPC_CHANNELS.DEMO_PARSE, demoPath),
  demoDetectHighlights: (demoPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEMO_DETECT_HIGHLIGHTS, demoPath),
  demoGetGameInfo: (demoPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEMO_GET_GAME_INFO, demoPath),

  // Dialog
  openDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN, options),
  openVideoDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN, {
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }),

  // CS2 environment
  cs2FindPath: () => ipcRenderer.invoke(IPC_CHANNELS.CS2_FIND_PATH),
  cs2ValidatePath: (path) => ipcRenderer.invoke(IPC_CHANNELS.CS2_VALIDATE_PATH, path),

  // Recording
  recordingStart: (request) => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_START, request),
  recordingStop: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP),
  onRecordingProgress: (callback) => {
    const handler = (_event: unknown, progress: RecordingProgress) => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.RECORDING_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_PROGRESS, handler)
    }
  },

  // OBS
  obsTestConnection: (config) => ipcRenderer.invoke(IPC_CHANNELS.OBS_TEST_CONNECTION, config),

  // Export
  exportStart: (request) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_START, request),
  exportCancel: () => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CANCEL),
  exportSelectOutput: () =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SELECT_OUTPUT, {
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mkv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }),
  onExportProgress: (callback) => {
    const handler = (_event: unknown, progress: ExportProgress) => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.EXPORT_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.EXPORT_PROGRESS, handler)
    }
  },

  // Project persistence
  projectSave: (project) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE, project),
  projectLoad: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LOAD),

  // Settings persistence
  settingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  settingsSet: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  settingsReset: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RESET),

  // File utilities
  getDroppedFilePath: (file: File) => webUtils.getPathForFile(file),

  // Window controls
  windowMinimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  windowMaximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  windowClose: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)