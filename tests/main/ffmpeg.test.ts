import { describe, it, expect, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

// Mock ffmpeg-static
vi.mock('ffmpeg-static', () => ({
  default: 'C:\\ffmpeg\\ffmpeg.exe',
}))

describe('ffmpeg', () => {
  it('should be importable', async () => {
    const { getFfmpegPath } = await import('../../src/main/ffmpeg')
    expect(getFfmpegPath).toBeDefined()
  })

  it('should return ffmpeg path', async () => {
    const { getFfmpegPath } = await import('../../src/main/ffmpeg')
    const path = getFfmpegPath()
    expect(path).toContain('ffmpeg')
  })
})
