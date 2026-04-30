import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'
import { CS2PathResolver } from './cs2-path-resolver'
import { getFfmpegPath, getFfprobePath } from './ffmpeg'
import { ExportService } from './export-service'
import { RecordingOrchestrator } from './recording-orchestrator'
import { getSettings, setSettings, resetSettings } from './settings-store'
import { IPC_CHANNELS } from '../shared/ipc'
import type { ExportRequest } from '../shared/export-types'
import type { RecordingRequest } from '../shared/recording-types'
import type { AppSettings } from '../shared/settings-types'

const pythonBridge = new PythonBridge()

// Register custom protocol for loading local video files securely
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-video', privileges: { stream: true, bypassCSP: true } }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function callPythonAPI(
  endpoint: string,
  body: Record<string, string>,
  retries = 3
): Promise<unknown> {
  const port = pythonBridge.getPort()
  if (!port) {
    throw new Error('Python backend is not running')
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Python API error: ${response.status} ${errorText}`)
      }
      return response.json()
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }
      throw err
    }
  }
}

function registerIpcHandlers(): void {
  // Python bridge handlers
  ipcMain.handle(IPC_CHANNELS.PYTHON_START, async () => {
    await pythonBridge.start()
  })

  ipcMain.handle(IPC_CHANNELS.PYTHON_STOP, async () => {
    await pythonBridge.stop()
  })

  ipcMain.handle(IPC_CHANNELS.PYTHON_HEALTH, async () => {
    return pythonBridge.health()
  })

  // Demo operations
  ipcMain.handle(IPC_CHANNELS.DEMO_PARSE, async (_event, demoPath: string) => {
    return callPythonAPI('/parse_demo', { demo_path: demoPath })
  })

  ipcMain.handle(IPC_CHANNELS.DEMO_DETECT_HIGHLIGHTS, async (_event, demoPath: string) => {
    return callPythonAPI('/detect_highlights', { demo_path: demoPath })
  })

  ipcMain.handle(IPC_CHANNELS.DEMO_GET_GAME_INFO, async (_event, demoPath: string) => {
    return callPythonAPI('/game_info', { demo_path: demoPath })
  })

  // Dialog handler
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN, async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: options?.filters || [
        { name: 'Demo Files', extensions: ['dem'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // CS2 environment detection
  ipcMain.handle(IPC_CHANNELS.CS2_FIND_PATH, async () => {
    const envInfo = CS2PathResolver.getEnvironmentInfo()
    return envInfo
  })

  ipcMain.handle(IPC_CHANNELS.CS2_VALIDATE_PATH, async (_event, cs2Path: string) => {
    return CS2PathResolver.validateCS2Path(cs2Path)
  })

  // Recording handlers
  let recordingOrchestrator: RecordingOrchestrator | null = null

  ipcMain.handle(IPC_CHANNELS.RECORDING_START, async (event, request: RecordingRequest) => {
    const webContents = event.sender

    recordingOrchestrator = new RecordingOrchestrator((progress) => {
      webContents.send(IPC_CHANNELS.RECORDING_PROGRESS, progress)
    })

    try {
      const result = await recordingOrchestrator.record(request)
      recordingOrchestrator = null
      return result
    } catch (err) {
      recordingOrchestrator = null
      const message = err instanceof Error ? err.message : 'Recording failed'
      return { success: false, clips: [], error: message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, async () => {
    recordingOrchestrator?.cancel()
    recordingOrchestrator = null
  })

  // OBS test connection
  ipcMain.handle(
    IPC_CHANNELS.OBS_TEST_CONNECTION,
    async (_event, config: { host: string; port: number; password?: string }) => {
      const OBSWebSocket = (await import('obs-websocket-js')).OBSWebSocket
      const obs = new OBSWebSocket()
      try {
        const url = `ws://${config.host}:${config.port}`
        await obs.connect(url, config.password || undefined)
        const version = await obs.call('GetVersion')
        await obs.disconnect()
        return { success: true, version: version.obsVersion }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    }
  )

  // Export handlers
  let exportService: ExportService | null = null

  ipcMain.handle(IPC_CHANNELS.EXPORT_START, async (event, request: ExportRequest) => {
    const webContents = event.sender

    let ffmpegPath: string
    let ffprobePath: string
    try {
      ffmpegPath = getFfmpegPath()
      ffprobePath = getFfprobePath()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ffmpeg/ffprobe not found'
      return { success: false, error: msg }
    }

    // Verify binaries exist
    if (!fs.existsSync(ffmpegPath)) {
      return { success: false, error: `ffmpeg not found at: ${ffmpegPath}` }
    }
    if (!fs.existsSync(ffprobePath)) {
      return { success: false, error: `ffprobe not found at: ${ffprobePath}` }
    }

    exportService = new ExportService(ffmpegPath, ffprobePath, (progress) => {
      webContents.send(IPC_CHANNELS.EXPORT_PROGRESS, progress)
    })

    try {
      const outputPath = await exportService.export(request)
      exportService = null
      return { success: true, outputPath }
    } catch (err) {
      exportService = null
      const message = err instanceof Error ? err.message : 'Export failed'
      return { success: false, error: message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, async () => {
    exportService?.cancel()
    exportService = null
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_SELECT_OUTPUT, async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showSaveDialog(window, {
      filters: options?.filters || [{ name: 'Video Files', extensions: ['mp4'] }],
      defaultPath: 'output.mp4'
    })
    return result.canceled ? null : result.filePath
  })

  // Project persistence
  ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, async (event, projectData) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showSaveDialog(window, {
      filters: [{ name: 'Project Files', extensions: ['json'] }],
      defaultPath: `${projectData.name || 'project'}.cs2proj.json`
    })
    if (result.canceled || !result.filePath) return null
    await fs.promises.writeFile(result.filePath, JSON.stringify(projectData, null, 2), 'utf-8')
    return result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_LOAD, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      filters: [{ name: 'Project Files', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const content = await fs.promises.readFile(result.filePaths[0], 'utf-8')
    return JSON.parse(content)
  })

  // Settings persistence
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, settings: Partial<AppSettings>) => {
    return setSettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, async () => {
    return resetSettings()
  })

  // Window control handlers
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })
}

app.whenReady().then(() => {
  // Register file protocol for local video loading
  protocol.registerFileProtocol('local-video', (request, callback) => {
    const filePath = decodeURIComponent(request.url.slice('local-video://'.length))
    callback({ path: filePath })
  })

  electronApp.setAppUserModelId('com.cs2demo-cutter')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await pythonBridge.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})