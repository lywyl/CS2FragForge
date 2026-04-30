import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock variables must be hoisted before vi.mock calls
const {
  mockObsConnect,
  mockObsDisconnect,
  mockObsEnsureScene,
  mockObsEnsureGameCaptureSource,
  mockObsStartRecording,
  mockObsStopRecording,
  mockCopyDemo,
  mockLaunch,
  mockTerminate,
  mockSendCommand,
  mockWatcherStart,
  mockWatcherStop,
  mockWriteCombinedCfg,
  mockRestoreAutoexecCfg,
  mockSplitVideo,
  mockCleanupObsRecording,
  mockGetFfmpegPath
} = vi.hoisted(() => ({
  mockObsConnect: vi.fn(),
  mockObsDisconnect: vi.fn(),
  mockObsEnsureScene: vi.fn(),
  mockObsEnsureGameCaptureSource: vi.fn(),
  mockObsStartRecording: vi.fn(),
  mockObsStopRecording: vi.fn(),
  mockCopyDemo: vi.fn(),
  mockLaunch: vi.fn(),
  mockTerminate: vi.fn(),
  mockSendCommand: vi.fn(),
  mockWatcherStart: vi.fn(),
  mockWatcherStop: vi.fn(),
  mockWriteCombinedCfg: vi.fn(),
  mockRestoreAutoexecCfg: vi.fn(),
  mockSplitVideo: vi.fn(),
  mockCleanupObsRecording: vi.fn(),
  mockGetFfmpegPath: vi.fn()
}))

let mockWatcherCallback: ((event: { type: string; data?: string }) => void) | null = null

// Mock electron
vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined)
}))

// Mock OBSService — use constructor function so `new OBSService()` works correctly
vi.mock('../../src/main/obs-service', () => ({
  OBSService: function () {
    this.connect = mockObsConnect
    this.disconnect = mockObsDisconnect
    this.ensureScene = mockObsEnsureScene
    this.ensureGameCaptureSource = mockObsEnsureGameCaptureSource
    this.startRecording = mockObsStartRecording
    this.stopRecording = mockObsStopRecording
    this.isConnected = true
  }
}))

// Mock DemoLauncher — use constructor function so `new DemoLauncher()` works correctly
vi.mock('../../src/main/demo-launcher', () => ({
  DemoLauncher: function () {
    this.copyDemoToReplays = mockCopyDemo
    this.launch = mockLaunch
    this.terminate = mockTerminate
    this.sendCommand = mockSendCommand
  }
}))

// Mock ConsoleLogWatcher — use constructor function so `new ConsoleLogWatcher()` works correctly
vi.mock('../../src/main/console-log-watcher', () => ({
  ConsoleLogWatcher: function (
    _path: string,
    callback: (event: { type: string; data?: string }) => void
  ) {
    mockWatcherCallback = callback
    this.start = mockWatcherStart
    this.stop = mockWatcherStop
  }
}))

// Mock cfg-writer
vi.mock('../../src/main/cfg-writer', () => ({
  writeCombinedCfg: mockWriteCombinedCfg,
  restoreAutoexecCfg: mockRestoreAutoexecCfg
}))

// Mock video-post-processor
vi.mock('../../src/main/video-post-processor', () => ({
  splitVideo: mockSplitVideo,
  cleanupObsRecording: mockCleanupObsRecording
}))

// Mock ffmpeg
vi.mock('../../src/main/ffmpeg', () => ({
  getFfmpegPath: mockGetFfmpegPath
}))

import { RecordingOrchestrator } from '../../src/main/recording-orchestrator'
import type { RecordingRequest } from '../../src/shared/recording-types'

describe('RecordingOrchestrator', () => {
  let onProgress: ReturnType<typeof vi.fn>

  const mockRequest: RecordingRequest = {
    demoPath: 'D:\\demos\\test.dem',
    highlights: [
      {
        id: 'hl-1',
        playerName: 's1mple',
        tickStart: 10000,
        tickEnd: 11000,
        round: 5,
        type: '3K',
        score: 85
      },
      {
        id: 'hl-2',
        playerName: 'ZywOo',
        tickStart: 20000,
        tickEnd: 21500,
        round: 8,
        type: '4K',
        score: 92
      }
    ],
    cs2Path: 'D:\\steam\\steamapps\\common\\Counter-Strike Global Offensive',
    preRoll: 5,
    postRoll: 3,
    tickRate: 64,
    outputDir: 'D:\\demos\\clips',
    obsConfig: {
      host: 'localhost',
      port: 4455,
      password: 'test123'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    onProgress = vi.fn()

    // Default successful mocks
    mockCopyDemo.mockResolvedValue('test.dem')
    mockWriteCombinedCfg.mockResolvedValue('D:\\cfg\\autoexec.cfg')
    mockLaunch.mockResolvedValue(undefined)
    mockObsConnect.mockResolvedValue(undefined)
    mockObsDisconnect.mockResolvedValue(undefined)
    mockObsEnsureScene.mockResolvedValue(undefined)
    mockObsEnsureGameCaptureSource.mockResolvedValue(undefined)
    mockObsStartRecording.mockResolvedValue(undefined)
    mockObsStopRecording.mockResolvedValue('D:\\recordings\\output.mp4')
    mockSplitVideo.mockResolvedValue([
      'D:\\demos\\clips\\s1mple_3K_R5_hl-1.mp4',
      'D:\\demos\\clips\\ZywOo_4K_R8_hl-2.mp4'
    ])
    mockCleanupObsRecording.mockResolvedValue(undefined)
    mockGetFfmpegPath.mockReturnValue('C:\\ffmpeg\\ffmpeg.exe')
    mockTerminate.mockResolvedValue(undefined)
    mockRestoreAutoexecCfg.mockResolvedValue(undefined)
    mockWatcherStart.mockResolvedValue(undefined)
    mockWatcherStop.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should throw if no highlights provided', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const request = { ...mockRequest, highlights: [] }

    await expect(orchestrator.record(request)).rejects.toThrow('No highlights to record')
  })

  it('should be constructable', () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    expect(orchestrator).toBeDefined()
  })

  it('should have cancel method', () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    expect(typeof orchestrator.cancel).toBe('function')
  })

  it('should complete full recording flow successfully', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    // Trigger demo loaded after 10ms
    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    const result = await recordPromise

    // Debug: log error if present
    if (!result.success) {
      console.log('DEBUG result:', JSON.stringify(result, null, 2))
    }

    expect(result.success).toBe(true)
    expect(result.clips).toHaveLength(2)
    expect(result.clips[0].success).toBe(true)
    expect(result.clips[0].highlightId).toBe('hl-1')
    expect(result.clips[1].success).toBe(true)
    expect(result.clips[1].highlightId).toBe('hl-2')

    // Verify flow calls
    expect(mockObsConnect).toHaveBeenCalledWith(mockRequest.obsConfig)
    expect(mockObsEnsureScene).toHaveBeenCalledWith('CS2FragForge')
    expect(mockObsEnsureGameCaptureSource).toHaveBeenCalledWith('CS2FragForge', 'CS2 Game Capture')
    expect(mockCopyDemo).toHaveBeenCalledWith(mockRequest.demoPath)
    expect(mockWriteCombinedCfg).toHaveBeenCalled()
    expect(mockLaunch).toHaveBeenCalledWith('test.dem', 'autoexec.cfg')
    expect(mockObsStartRecording).toHaveBeenCalled()
    expect(mockObsStopRecording).toHaveBeenCalled()
    expect(mockSplitVideo).toHaveBeenCalled()
    expect(mockTerminate).toHaveBeenCalled()
    expect(mockRestoreAutoexecCfg).toHaveBeenCalled()
  })

  it('should report progress through all stages', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    await recordPromise

    const statuses = onProgress.mock.calls.map((call) => call[0].status)
    expect(statuses).toContain('connecting-obs')
    expect(statuses).toContain('configuring-obs')
    expect(statuses).toContain('launching-cs2')
    expect(statuses).toContain('waiting-load')
    expect(statuses).toContain('recording')
    expect(statuses).toContain('stopping')
    expect(statuses).toContain('splitting')
    expect(statuses).toContain('done')
  })

  it('should handle OBS connection failure', async () => {
    mockObsConnect.mockRejectedValue(new Error('Connection refused'))
    const orchestrator = new RecordingOrchestrator(onProgress)

    const result = await orchestrator.record(mockRequest)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Connection refused')
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })

  it('should handle CS2 launch failure', async () => {
    mockLaunch.mockRejectedValue(new Error('CS2 not found'))
    const orchestrator = new RecordingOrchestrator(onProgress)

    const result = await orchestrator.record(mockRequest)

    expect(result.success).toBe(false)
    expect(result.error).toBe('CS2 not found')
    expect(mockObsDisconnect).toHaveBeenCalled()
  })

  it('should handle OBS recording start failure', async () => {
    mockObsStartRecording.mockRejectedValue(new Error('Recording failed'))
    const orchestrator = new RecordingOrchestrator(onProgress)

    const result = await orchestrator.record(mockRequest)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Recording failed')
  })

  it('should handle demo load timeout gracefully', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    // Don't trigger demo-loaded — let it timeout
    mockWatcherStart.mockImplementation(() => {
      // Never call callback — timeout will fire
    })

    const recordPromise = orchestrator.record(mockRequest)
    // Advance past demo load timeout (45s) + recording duration (~60s)
    await vi.advanceTimersByTimeAsync(120_000)
    await recordPromise

    // Should still complete (proceeds with warning)
    expect(mockSendCommand).toHaveBeenCalledWith('exec autoexec.cfg')
  })

  it('should handle FFmpeg split partial failure', async () => {
    mockSplitVideo.mockRejectedValue(new Error('FFmpeg error'))
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    const result = await recordPromise

    // Partial success — clips marked as failed
    expect(result.clips).toHaveLength(2)
    expect(result.clips[0].success).toBe(false)
    expect(result.clips[1].success).toBe(false)
  })

  it('should cancel recording when cancel() is called during flow', async () => {
    // Make OBS connect take some time so we can cancel mid-flow
    mockObsConnect.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500))
    )

    const orchestrator = new RecordingOrchestrator(onProgress)

    // Cancel after connect starts
    setTimeout(() => orchestrator.cancel(), 10)

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await recordPromise

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cancelled')
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
  })

  it('should cleanup on cancellation during OBS connect', async () => {
    mockObsConnect.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    )

    const orchestrator = new RecordingOrchestrator(onProgress)

    // Cancel after a tiny delay
    setTimeout(() => orchestrator.cancel(), 10)

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(1_500)
    const result = await recordPromise

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cancelled')
  })

  it('should calculate correct clip durations', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    const result = await recordPromise

    // hl-1: (11000 - 10000) / 64 = 15.625s + 5 pre + 3 post = 23.625s
    expect(result.clips[0].duration).toBeCloseTo(23.625, 1)
    // hl-2: (21500 - 20000) / 64 = 23.4375s + 5 pre + 3 post = 31.4375s
    expect(result.clips[1].duration).toBeCloseTo(31.4375, 1)
  })

  it('should build correct output filenames', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    await recordPromise

    expect(mockSplitVideo).toHaveBeenCalledWith(
      'D:\\recordings\\output.mp4',
      expect.arrayContaining([
        expect.objectContaining({ outputName: 's1mple_3K_R5_hl-1.mp4' }),
        expect.objectContaining({ outputName: 'ZywOo_4K_R8_hl-2.mp4' })
      ]),
      'D:\\demos\\clips',
      'C:\\ffmpeg\\ffmpeg.exe'
    )
  })

  it('should disconnect OBS on completion', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    await recordPromise

    expect(mockObsDisconnect).toHaveBeenCalled()
  })

  it('should restore autoexec.cfg on completion', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    await recordPromise

    expect(mockRestoreAutoexecCfg).toHaveBeenCalled()
  })

  it('should cleanup OBS recording file after split', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)

    mockWatcherStart.mockImplementation(() => {
      setTimeout(() => {
        mockWatcherCallback?.({ type: 'demo-loaded' })
      }, 10)
    })

    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(70_000)
    await recordPromise

    expect(mockCleanupObsRecording).toHaveBeenCalledWith('D:\\recordings\\output.mp4')
  })
})
