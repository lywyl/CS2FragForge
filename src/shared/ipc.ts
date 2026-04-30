export const IPC_CHANNELS = {
  // Python bridge
  PYTHON_START: 'python:start',
  PYTHON_STOP: 'python:stop',
  PYTHON_STATUS: 'python:status',
  PYTHON_HEALTH: 'python:health',

  // Demo operations
  DEMO_PARSE: 'demo:parse',
  DEMO_DETECT_HIGHLIGHTS: 'demo:detectHighlights',
  DEMO_GET_GAME_INFO: 'demo:getGameInfo',

  // Dialog
  DIALOG_OPEN: 'dialog:open',
  DIALOG_SAVE: 'dialog:save',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // CS2 environment
  CS2_FIND_PATH: 'cs2:findPath',
  CS2_VALIDATE_PATH: 'cs2:validatePath',

  // Recording
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_PROGRESS: 'recording:progress',

  // Export
  EXPORT_START: 'export:start',
  EXPORT_CANCEL: 'export:cancel',
  EXPORT_PROGRESS: 'export:progress',
  EXPORT_SELECT_OUTPUT: 'export:selectOutput',

  // Project persistence
  PROJECT_SAVE: 'project:save',
  PROJECT_LOAD: 'project:load',

  // Settings persistence
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]