import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  mockObsConnect, mockObsDisconnect, mockObsEnsureScene, mockObsEnsureGameCaptureSource,
  mockObsStartRecording, mockObsStopRecording,
  mockCopyDemo, mockLaunch, mockTerminate,
  mockInjectTimedSequence,
  mockWatcherStart, mockWatcherStop,
  mockWriteLaunchCfg,
  mockSplitVideo, mockCleanupObsRecording, mockGetFfmpegPath
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
  mockInjectTimedSequence: vi.fn(),
  mockWatcherStart: vi.fn(),
  mockWatcherStop: vi.fn(),
  mockWriteLaunchCfg: vi.fn(),
  mockSplitVideo: vi.fn(),
  mockCleanupObsRecording: vi.fn(),
  mockGetFfmpegPath: vi.fn()
}))

let mockWatcherCallbacks: Array<(event: { type: string; data?: string }) => void> = []

vi.mock('electron', () => ({ app: { isPackaged: false } }))

vi.mock('fs/promises', () => {
  const mocks = {
    access: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined)
  }
  return { default: mocks, ...mocks }
})

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

vi.mock('../../src/main/demo-launcher', () => ({
  DemoLauncher: function () {
    this.copyDemoToCsgo = mockCopyDemo
    this.launch = mockLaunch
    this.terminate = mockTerminate
  }
}))

vi.mock('../../src/main/console-log-watcher', () => ({
  ConsoleLogWatcher: function (
    _path: string,
    callback: (event: { type: string; data?: string }) => void
  ) {
    mockWatcherCallbacks.push(callback)
    this.start = mockWatcherStart
    this.stop = mockWatcherStop
  }
}))

vi.mock('../../src/main/win-console-inject', () => ({
  injectTimedSequence: mockInjectTimedSequence,
  injectSingleCommand: vi.fn().mockResolvedValue(true),
  cleanupInjectScript: vi.fn()
}))

vi.mock('../../src/main/cfg-writer', () => ({
  writeLaunchCfg: mockWriteLaunchCfg
}))

vi.mock('../../src/main/video-post-processor', () => ({
  splitVideo: mockSplitVideo,
  cleanupObsRecording: mockCleanupObsRecording
}))

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
      { id: 'hl-1', playerName: 's1mple', tickStart: 10000, tickEnd: 11000, round: 5, type: '3K', score: 85 },
      { id: 'hl-2', playerName: 'ZywOo', tickStart: 20000, tickEnd: 21500, round: 8, type: '4K', score: 92 }
    ],
    cs2Path: 'D:\\steam\\steamapps\\common\\Counter-Strike Global Offensive',
    preRoll: 5, postRoll: 3, tickRate: 64,
    outputDir: 'D:\\demos\\clips',
    obsConfig: { host: 'localhost', port: 4455, password: 'test123' }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWatcherCallbacks = []
    onProgress = vi.fn()

    mockCopyDemo.mockResolvedValue('_csm_abc')
    mockWriteLaunchCfg.mockResolvedValue('D:\\cfg\\launch.cfg')
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
    mockInjectTimedSequence.mockResolvedValue(true)

    let watcherSeq = 0
    mockWatcherStart.mockImplementation(() => {
      const idx = watcherSeq++
      setTimeout(() => {
        if (idx === 0 && mockWatcherCallbacks.length > 0) {
          mockWatcherCallbacks[0]?.({ type: 'cs2-ready' })
        } else if (idx === 1 && mockWatcherCallbacks.length > 1) {
          mockWatcherCallbacks[1]?.({ type: 'demo-loaded' })
        }
      }, 10)
    })
    mockWatcherStop.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should throw if no highlights provided', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    await expect(orchestrator.record({ ...mockRequest, highlights: [] })).rejects.toThrow('No highlights to record')
  })

  it('should be constructable', () => {
    expect(new RecordingOrchestrator(onProgress)).toBeDefined()
  })

  it('should have cancel method', () => {
    expect(typeof new RecordingOrchestrator(onProgress).cancel).toBe('function')
  })

  it('should complete full recording flow with per-clip injection', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const recordPromise = orchestrator.record(mockRequest)

    // Advance past all waits: ready(0) + demo-load(0) + 2s + pause(200ms) + clip1(23.6s) + clip2(31.4s) + OBS + FFmpeg
    await vi.advanceTimersByTimeAsync(80_000)
    const result = await recordPromise

    expect(result.success).toBe(true)
    expect(result.clips).toHaveLength(2)
    expect(result.clips[0].success).toBe(true)
    expect(result.clips[1].success).toBe(true)

    // Verify per-clip injection: initial pause + 2 clips × (seek + setup) + 1 inter-clip pause = 6
    expect(mockInjectTimedSequence).toHaveBeenCalledTimes(6)

    // First seek call per clip should start with demo_pause (bundled with gototick)
    const seek1steps = mockInjectTimedSequence.mock.calls[1][0]
    expect(seek1steps[0].cmd).toBe('demo_pause')
    expect(seek1steps[2].cmd).toBe('demo_gototick 9680')
    expect(seek1steps[3].cmd).toBe('demo_resume')
    expect(mockObsStartRecording).toHaveBeenCalled()
    expect(mockObsStopRecording).toHaveBeenCalled()
    expect(mockSplitVideo).toHaveBeenCalled()
    expect(mockTerminate).toHaveBeenCalled()
  })

  it('should inject demo_pause before OBS start', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(80_000)
    await recordPromise

    // First injection should be demo_pause
    const firstCall = mockInjectTimedSequence.mock.calls[0][0]
    expect(firstCall[0].cmd).toBe('demo_pause')
  })

  it('should bundle demo_pause + gototick in same injection batch', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(80_000)
    await recordPromise

    // Call order: [0]=init pause, [1]=clip1 seek, [2]=clip1 setup, [3]=inter pause, [4]=clip2 seek, [5]=clip2 setup

    // Clip 1 seek: steps[0]=demo_pause, steps[1]=demo_timescale 1, steps[2]=demo_gototick, steps[3]=demo_resume
    const clip1seek = mockInjectTimedSequence.mock.calls[1][0]
    expect(clip1seek[0].cmd).toBe('demo_pause')
    expect(clip1seek[1].cmd).toBe('demo_timescale 1')
    expect(clip1seek[2].cmd).toBe('demo_gototick 9680')
    expect(clip1seek[3].cmd).toBe('demo_resume')
    expect(clip1seek[2].delay).toBe(3500)

    // Clip 2 seek
    const clip2seek = mockInjectTimedSequence.mock.calls[4][0]
    expect(clip2seek[2].cmd).toBe('demo_gototick 19680')
  })

  it('should inject spec_player for each clip', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(80_000)
    await recordPromise

    // Call order: [0]=init pause, [1]=clip1 seek, [2]=clip1 setup, [3]=inter pause, [4]=clip2 seek, [5]=clip2 setup
    const setup1call = mockInjectTimedSequence.mock.calls[2][0]
    expect(setup1call[0].cmd).toBe('spec_mode 5')
    expect(setup1call[1].cmd).toBe('spec_player s1mple')

    const setup2call = mockInjectTimedSequence.mock.calls[5][0]
    expect(setup2call[0].cmd).toBe('spec_mode 5')
    expect(setup2call[1].cmd).toBe('spec_player ZywOo')
  })

  it('should handle OBS connection failure', async () => {
    mockObsConnect.mockRejectedValue(new Error('Connection refused'))
    const orchestrator = new RecordingOrchestrator(onProgress)
    const result = await orchestrator.record(mockRequest)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Connection refused')
  })

  it('should handle CS2 launch failure', async () => {
    mockLaunch.mockRejectedValue(new Error('CS2 not found'))
    const orchestrator = new RecordingOrchestrator(onProgress)
    const result = await orchestrator.record(mockRequest)
    expect(result.success).toBe(false)
    expect(result.error).toBe('CS2 not found')
  })

  it('should handle injection failure gracefully', async () => {
    mockInjectTimedSequence.mockResolvedValue(false)
    const orchestrator = new RecordingOrchestrator(onProgress)
    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(80_000)
    const result = await recordPromise
    // Should still complete, clips may be empty/wrong but flow continues
    expect(mockObsStopRecording).toHaveBeenCalled()
  })

  it('should cancel recording when cancel() is called', async () => {
    mockObsConnect.mockImplementation(() => new Promise((r) => setTimeout(r, 500)))
    const orchestrator = new RecordingOrchestrator(onProgress)
    setTimeout(() => orchestrator.cancel(), 10)
    const recordPromise = orchestrator.record(mockRequest)
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await recordPromise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cancelled')
  })
})
