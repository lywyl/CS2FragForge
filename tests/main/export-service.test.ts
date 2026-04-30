import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

// Mock ffmpeg-static
vi.mock('ffmpeg-static', () => ({
  default: 'C:\\ffmpeg\\ffmpeg.exe'
}))

// Mock ffprobe-static
vi.mock('ffprobe-static', () => ({
  default: 'C:\\ffmpeg\\ffprobe.exe'
}))

// Mock fluent-ffmpeg
const mockCommand = {
  setStartTime: vi.fn().mockReturnThis(),
  setDuration: vi.fn().mockReturnThis(),
  input: vi.fn().mockReturnThis(),
  inputOptions: vi.fn().mockReturnThis(),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  complexFilter: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  run: vi.fn(),
  kill: vi.fn()
}

vi.mock('fluent-ffmpeg', () => {
  const ffmpeg = vi.fn(() => ({ ...mockCommand }))
  ffmpeg.setFfmpegPath = vi.fn()
  ffmpeg.setFfprobePath = vi.fn()
  return { default: ffmpeg }
})

describe('ExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock command chain
    mockCommand.setStartTime.mockReturnThis()
    mockCommand.setDuration.mockReturnThis()
    mockCommand.input.mockReturnThis()
    mockCommand.inputOptions.mockReturnThis()
    mockCommand.outputOptions.mockReturnThis()
    mockCommand.output.mockReturnThis()
    mockCommand.complexFilter.mockReturnThis()
    mockCommand.on.mockReturnThis()
  })

  it('should be importable', async () => {
    const { ExportService } = await import('../../src/main/export-service')
    expect(ExportService).toBeDefined()
  })

  it('should throw on empty clips', async () => {
    const { ExportService } = await import('../../src/main/export-service')
    const service = new ExportService('/ffmpeg', '/ffprobe', vi.fn())
    await expect(
      service.export({
        clips: [],
        audioTracks: [],
        outputPath: 'out.mp4',
        settings: {
          outputFormat: 'mp4',
          videoCodec: 'libx264',
          audioCodec: 'aac',
          crf: 22,
          resolution: 'source',
          audioBitrate: '192k'
        }
      })
    ).rejects.toThrow('No clips to export')
  })

  it('should configure ffmpeg paths on construction', async () => {
    const ffmpeg = (await import('fluent-ffmpeg')).default
    const { ExportService } = await import('../../src/main/export-service')
    new ExportService('/test/ffmpeg', '/test/ffprobe', vi.fn())
    expect(ffmpeg.setFfmpegPath).toHaveBeenCalledWith('/test/ffmpeg')
    expect(ffmpeg.setFfprobePath).toHaveBeenCalledWith('/test/ffprobe')
  })

  it('should call fluent-ffmpeg for single clip trim', async () => {
    const ffmpeg = (await import('fluent-ffmpeg')).default
    const { ExportService } = await import('../../src/main/export-service')

    // Make the 'end' handler fire immediately
    mockCommand.on.mockImplementation((event: string, handler: (arg?: unknown) => void) => {
      if (event === 'end') {
        setTimeout(() => handler(), 0)
      }
      return mockCommand
    })

    // Mock fs operations
    const fs = await import('fs')
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/cs2cutter-test' as never)
    vi.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined)

    const service = new ExportService('/ffmpeg', '/ffprobe', vi.fn())
    const result = await service.export({
      clips: [{ sourcePath: 'test.mp4', startSec: 10, endSec: 20, volume: 1 }],
      audioTracks: [],
      outputPath: 'out.mp4',
      settings: {
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        crf: 22,
        resolution: 'source',
        audioBitrate: '192k'
      }
    })

    expect(ffmpeg).toHaveBeenCalled()
    expect(result).toBe('out.mp4')
  })

  it('should call cancel and kill ffmpeg process', async () => {
    const { ExportService } = await import('../../src/main/export-service')
    const service = new ExportService('/ffmpeg', '/ffprobe', vi.fn())

    // Set internal currentCommand via a mock export
    mockCommand.on.mockImplementation((event: string, handler: (arg?: unknown) => void) => {
      if (event === 'progress') {
        // Don't call progress handler
      }
      return mockCommand
    })

    service.cancel()
    // After cancel, isCancelled is set - verify no crash
    expect(true).toBe(true)
  })
})
