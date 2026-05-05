import { OBSWebSocket } from 'obs-websocket-js'

export class OBSService {
  private obs: OBSWebSocket
  private _connected = false

  constructor() {
    this.obs = new OBSWebSocket()
  }

  get isConnected(): boolean {
    return this._connected
  }

  async connect(config: { host: string; port: number; password?: string }): Promise<void> {
    const url = `ws://${config.host}:${config.port}`
    try {
      await this.obs.connect(url, config.password)
      this._connected = true
    } catch (error) {
      this._connected = false
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to connect to OBS at ${url}: ${message}`)
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.obs.disconnect()
    } finally {
      this._connected = false
    }
  }

  async ensureScene(sceneName: string): Promise<void> {
    this.assertConnected()

    // Get existing scenes
    const { scenes } = await this.obs.call('GetSceneList')
    const sceneExists = scenes.some((s) => s.sceneName === sceneName)

    // Create scene if missing
    if (!sceneExists) {
      try {
        await this.obs.call('CreateScene', { sceneName })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to create scene "${sceneName}": ${message}`)
      }
    }

    // Set as current program scene
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to set current scene to "${sceneName}": ${message}`)
    }
  }

  async ensureGameCaptureSource(sceneName: string, sourceName: string): Promise<void> {
    this.assertConnected()

    try {
      await this.obs.call('CreateInput', {
        sceneName,
        inputName: sourceName,
        inputKind: 'game_capture',
        inputSettings: {
          capture_mode: 'foreground_window'
        },
        sceneItemEnabled: true
      })
    } catch (error) {
      // Source might already exist - that's okay
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('already exists')) {
        throw new Error(`Failed to create game capture source "${sourceName}": ${message}`)
      }
    }
  }

  async setCurrentScene(sceneName: string): Promise<void> {
    this.assertConnected()

    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to set current scene to "${sceneName}": ${message}`)
    }
  }

  async startRecording(): Promise<void> {
    this.assertConnected()

    try {
      // Stop any stale recording first to avoid "output already active" errors
      const status = await this.obs.call('GetRecordStatus')
      if (status.outputActive) {
        console.warn('[OBS] Stale recording active — stopping before restart')
        await this.obs.call('StopRecord')
        await new Promise((r) => setTimeout(r, 500))
      }
    } catch {
      // GetRecordStatus may fail if OBS is in a weird state; proceed anyway
    }

    try {
      await this.obs.call('StartRecord')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to start recording: ${message}`)
    }
  }

  async stopRecording(): Promise<string | null> {
    this.assertConnected()

    try {
      const result = await this.obs.call('StopRecord')
      return result.outputPath ?? null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to stop recording: ${message}`)
    }
  }

  async getRecordStatus(): Promise<{ outputActive: boolean; outputPath?: string }> {
    this.assertConnected()

    try {
      const result = await this.obs.call('GetRecordStatus')
      return {
        outputActive: result.outputActive
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to get record status: ${message}`)
    }
  }

  async getRecordDirectory(): Promise<string> {
    this.assertConnected()

    try {
      const result = await this.obs.call('GetRecordDirectory')
      return result.recordDirectory
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to get record directory: ${message}`)
    }
  }

  async testConnection(config: {
    host: string
    port: number
    password?: string
  }): Promise<{ success: boolean; version?: string; error?: string }> {
    const testObs = new OBSWebSocket()
    const url = `ws://${config.host}:${config.port}`

    try {
      await testObs.connect(url, config.password)
      const versionInfo = await testObs.call('GetVersion')
      return {
        success: true,
        version: versionInfo.obsWebSocketVersion
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: message
      }
    } finally {
      try {
        await testObs.disconnect()
      } catch {
        // Ignore disconnect errors in cleanup
      }
    }
  }

  private assertConnected(): void {
    if (!this._connected) {
      throw new Error('Not connected to OBS. Call connect() first.')
    }
  }
}

export default OBSService
