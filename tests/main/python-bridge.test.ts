import { describe, it, expect, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    kill: vi.fn(),
  })),
}))

describe('PythonBridge', () => {
  it('should be importable', async () => {
    const { PythonBridge } = await import('../../src/main/python-bridge')
    expect(PythonBridge).toBeDefined()
  })

  it('should instantiate', async () => {
    const { PythonBridge } = await import('../../src/main/python-bridge')
    const bridge = new PythonBridge()
    expect(bridge).toBeDefined()
  })
})
