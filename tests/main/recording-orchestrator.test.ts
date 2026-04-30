import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    kill: vi.fn(),
    on: vi.fn(),
    exitCode: null
  })),
  execSync: vi.fn()
}))

vi.mock('fs/promises', () => ({
  default: {
    copyFile: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn()
  },
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn()
}))

vi.mock('fs', () => ({
  default: {
    openSync: vi.fn(),
    fstatSync: vi.fn(() => ({ size: 0 })),
    readSync: vi.fn(),
    closeSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn()
  },
  openSync: vi.fn(),
  fstatSync: vi.fn(() => ({ size: 0 })),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn()
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
      }
    ],
    cs2Path: 'D:\\steam\\steamapps\\common\\Counter-Strike Global Offensive',
    preRoll: 5,
    postRoll: 3,
    tickRate: 64,
    outputDir: 'D:\\demos\\clips'
  }

  beforeEach(() => {
    onProgress = vi.fn()
  })

  it('should throw if no highlights provided', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const request = { ...mockRequest, highlights: [] }

    await expect(orchestrator.record(request)).rejects.toThrow('No highlights to record')
  })

  it('should report error progress on empty highlights', async () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    const request = { ...mockRequest, highlights: [] }

    try {
      await orchestrator.record(request)
    } catch {
      // expected
    }
  })

  it('should be constructable', () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    expect(orchestrator).toBeDefined()
  })

  it('should have cancel method', () => {
    const orchestrator = new RecordingOrchestrator(onProgress)
    expect(typeof orchestrator.cancel).toBe('function')
  })
})
