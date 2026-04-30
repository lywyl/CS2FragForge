import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process
const mockSpawn = vi.fn(() => ({
  on: vi.fn((event: string, cb: (code?: number) => void) => {
    if (event === 'close') cb(0)
  }),
  stderr: { on: vi.fn() }
}))

vi.mock('child_process', () => ({
  spawn: mockSpawn
}))

// Mock fs/promises
const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockUnlink = vi.fn().mockResolvedValue(undefined)

vi.mock('fs/promises', () => ({
  default: {
    mkdir: mockMkdir,
    unlink: mockUnlink
  },
  mkdir: mockMkdir,
  unlink: mockUnlink
}))

describe('video-post-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset spawn mock to default success behavior
    mockSpawn.mockReturnValue({
      on: vi.fn((event: string, cb: (code?: number) => void) => {
        if (event === 'close') cb(0)
      }),
      stderr: { on: vi.fn() }
    })
  })

  describe('splitVideo', () => {
    it('should generate correct FFmpeg args for 1 highlight', async () => {
      const { splitVideo } = await import('../../src/main/video-post-processor')

      const highlights = [
        { id: 'h1', startSec: 10, durationSec: 5, outputName: 'clip1.mp4' }
      ]

      const result = await splitVideo(
        'C:\\obs\\recording.mp4',
        highlights,
        'C:\\output',
        'C:\\ffmpeg\\ffmpeg.exe'
      )

      expect(mockSpawn).toHaveBeenCalledTimes(1)
      expect(mockSpawn).toHaveBeenCalledWith('C:\\ffmpeg\\ffmpeg.exe', [
        '-ss', '10',
        '-i', 'C:\\obs\\recording.mp4',
        '-t', '5',
        '-c', 'copy',
        'C:\\output\\clip1.mp4'
      ])
      expect(result).toEqual(['C:\\output\\clip1.mp4'])
    })

    it('should generate correct FFmpeg args for 3 highlights', async () => {
      const { splitVideo } = await import('../../src/main/video-post-processor')

      const highlights = [
        { id: 'h1', startSec: 10, durationSec: 5, outputName: 'clip1.mp4' },
        { id: 'h2', startSec: 30, durationSec: 8, outputName: 'clip2.mp4' },
        { id: 'h3', startSec: 60, durationSec: 3, outputName: 'clip3.mp4' }
      ]

      const result = await splitVideo(
        'C:\\obs\\recording.mp4',
        highlights,
        'C:\\output',
        'C:\\ffmpeg\\ffmpeg.exe'
      )

      expect(mockSpawn).toHaveBeenCalledTimes(3)
      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'C:\\ffmpeg\\ffmpeg.exe', [
        '-ss', '10',
        '-i', 'C:\\obs\\recording.mp4',
        '-t', '5',
        '-c', 'copy',
        'C:\\output\\clip1.mp4'
      ])
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'C:\\ffmpeg\\ffmpeg.exe', [
        '-ss', '30',
        '-i', 'C:\\obs\\recording.mp4',
        '-t', '8',
        '-c', 'copy',
        'C:\\output\\clip2.mp4'
      ])
      expect(mockSpawn).toHaveBeenNthCalledWith(3, 'C:\\ffmpeg\\ffmpeg.exe', [
        '-ss', '60',
        '-i', 'C:\\obs\\recording.mp4',
        '-t', '3',
        '-c', 'copy',
        'C:\\output\\clip3.mp4'
      ])
      expect(result).toEqual([
        'C:\\output\\clip1.mp4',
        'C:\\output\\clip2.mp4',
        'C:\\output\\clip3.mp4'
      ])
    })

    it('should throw error with highlight id when FFmpeg fails', async () => {
      // Override spawn mock to simulate failure
      mockSpawn.mockReturnValue({
        on: vi.fn((event: string, cb: (code?: number) => void) => {
          if (event === 'close') cb(1)
        }),
        stderr: { on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') cb(Buffer.from('FFmpeg error output'))
        })}
      })

      const { splitVideo } = await import('../../src/main/video-post-processor')

      const highlights = [
        { id: 'h1', startSec: 10, durationSec: 5, outputName: 'clip1.mp4' }
      ]

      await expect(
        splitVideo('C:\\obs\\recording.mp4', highlights, 'C:\\output', 'C:\\ffmpeg\\ffmpeg.exe')
      ).rejects.toThrow('FFmpeg split failed for highlight "h1"')
    })

    it('should create output directory if not exists', async () => {
      const { splitVideo } = await import('../../src/main/video-post-processor')

      const highlights = [
        { id: 'h1', startSec: 10, durationSec: 5, outputName: 'clip1.mp4' }
      ]

      await splitVideo('C:\\obs\\recording.mp4', highlights, 'C:\\output', 'C:\\ffmpeg\\ffmpeg.exe')

      expect(mockMkdir).toHaveBeenCalledWith('C:\\output', { recursive: true })
    })
  })

  describe('cleanupObsRecording', () => {
    it('should delete the OBS recording file', async () => {
      const { cleanupObsRecording } = await import('../../src/main/video-post-processor')

      await cleanupObsRecording('C:\\obs\\recording.mp4')

      expect(mockUnlink).toHaveBeenCalledWith('C:\\obs\\recording.mp4')
    })

    it('should not throw if file does not exist', async () => {
      mockUnlink.mockRejectedValueOnce(new Error('ENOENT'))

      const { cleanupObsRecording } = await import('../../src/main/video-post-processor')

      await expect(cleanupObsRecording('C:\\obs\\nonexistent.mp4')).resolves.not.toThrow()
    })
  })

  describe('cleanupCfgFile', () => {
    it('should delete the cfg file', async () => {
      const { cleanupCfgFile } = await import('../../src/main/video-post-processor')

      await cleanupCfgFile('C:\\cs2\\game\\csgo\\cfg\\autoexec.cfg')

      expect(mockUnlink).toHaveBeenCalledWith('C:\\cs2\\game\\csgo\\cfg\\autoexec.cfg')
    })

    it('should not throw if file does not exist', async () => {
      mockUnlink.mockRejectedValueOnce(new Error('ENOENT'))

      const { cleanupCfgFile } = await import('../../src/main/video-post-processor')

      await expect(cleanupCfgFile('C:\\nonexistent.cfg')).resolves.not.toThrow()
    })
  })
})
