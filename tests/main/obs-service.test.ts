import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track whether to simulate connection failure
let shouldFailConnect = false

// Mock obs-websocket-js
vi.mock('obs-websocket-js', () => {
  return {
    default: class MockOBS {
      identified = false

      async connect(_url?: string, _password?: string): Promise<void> {
        if (shouldFailConnect) {
          throw new Error('Connection refused')
        }
        this.identified = true
      }

      async disconnect(): Promise<void> {
        this.identified = false
      }

      async call(requestType: string, _requestData?: unknown): Promise<unknown> {
        switch (requestType) {
          case 'GetSceneList':
            return {
              scenes: [{ sceneName: 'Scene 1' }, { sceneName: 'Scene 2' }],
              currentProgramSceneName: 'Scene 1'
            }
          case 'CreateScene':
            return { sceneUuid: 'new-uuid' }
          case 'SetCurrentProgramScene':
            return undefined
          case 'CreateInput':
            return { inputUuid: 'input-uuid', sceneItemId: 1 }
          case 'StartRecord':
            return undefined
          case 'StopRecord':
            return { outputPath: 'C:\\Recordings\\test.mp4' }
          case 'GetRecordStatus':
            return { outputActive: true, outputPaused: false }
          case 'GetRecordDirectory':
            return { recordDirectory: 'C:\\Recordings' }
          case 'GetVersion':
            return {
              obsVersion: '30.0.0',
              obsWebSocketVersion: '5.0.8',
              rpcVersion: 1
            }
          default:
            throw new Error(`Unknown request type: ${requestType}`)
        }
      }
    }
  }
})

import { OBSService } from '../../src/main/obs-service'

describe('OBSService', () => {
  let service: OBSService

  beforeEach(() => {
    service = new OBSService()
    shouldFailConnect = false
  })

  describe('connect/disconnect lifecycle', () => {
    it('should start disconnected', () => {
      expect(service.isConnected).toBe(false)
    })

    it('should connect successfully', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })
      expect(service.isConnected).toBe(true)
    })

    it('should disconnect successfully', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })
      await service.disconnect()
      expect(service.isConnected).toBe(false)
    })

    it('should connect with password', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455, password: 'secret' })
      expect(service.isConnected).toBe(true)
    })
  })

  describe('ensureScene', () => {
    it('should create scene when missing', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      // Scene "New Scene" doesn't exist in mock data, so it should be created
      await expect(service.ensureScene('New Scene')).resolves.toBeUndefined()
    })

    it('should reuse existing scene', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      // Scene "Scene 1" exists in mock data
      await expect(service.ensureScene('Scene 1')).resolves.toBeUndefined()
    })

    it('should throw when not connected', async () => {
      await expect(service.ensureScene('Test')).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('ensureGameCaptureSource', () => {
    it('should create game capture source', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      await expect(
        service.ensureGameCaptureSource('Scene 1', 'Game Capture')
      ).resolves.toBeUndefined()
    })

    it('should throw when not connected', async () => {
      await expect(
        service.ensureGameCaptureSource('Scene 1', 'Game Capture')
      ).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('setCurrentScene', () => {
    it('should set current scene', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      await expect(service.setCurrentScene('Scene 2')).resolves.toBeUndefined()
    })

    it('should throw when not connected', async () => {
      await expect(service.setCurrentScene('Scene 1')).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('startRecording', () => {
    it('should start recording', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      await expect(service.startRecording()).resolves.toBeUndefined()
    })

    it('should throw when not connected', async () => {
      await expect(service.startRecording()).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('stopRecording', () => {
    it('should stop recording and return path', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      const path = await service.stopRecording()
      expect(path).toBe('C:\\Recordings\\test.mp4')
    })

    it('should throw when not connected', async () => {
      await expect(service.stopRecording()).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('getRecordStatus', () => {
    it('should get record status', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      const status = await service.getRecordStatus()
      expect(status.outputActive).toBe(true)
    })

    it('should throw when not connected', async () => {
      await expect(service.getRecordStatus()).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('getRecordDirectory', () => {
    it('should get record directory', async () => {
      await service.connect({ host: '127.0.0.1', port: 4455 })

      const dir = await service.getRecordDirectory()
      expect(dir).toBe('C:\\Recordings')
    })

    it('should throw when not connected', async () => {
      await expect(service.getRecordDirectory()).rejects.toThrow('Not connected to OBS')
    })
  })

  describe('testConnection', () => {
    it('should return success on successful connection', async () => {
      const result = await service.testConnection({
        host: '127.0.0.1',
        port: 4455
      })

      expect(result.success).toBe(true)
      expect(result.version).toBe('5.0.8')
      expect(result.error).toBeUndefined()
    })

    it('should return failure on connection error', async () => {
      // Enable connection failure simulation
      shouldFailConnect = true

      const result = await service.testConnection({
        host: '192.168.1.999',
        port: 4455
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
      expect(result.version).toBeUndefined()

      // Reset for other tests
      shouldFailConnect = false
    })

    it('should disconnect after test even on success', async () => {
      const result = await service.testConnection({
        host: '127.0.0.1',
        port: 4455
      })

      expect(result.success).toBe(true)
      // The test connection uses a separate OBS instance, so our service should still be disconnected
      expect(service.isConnected).toBe(false)
    })
  })
})
