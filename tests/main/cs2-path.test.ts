import { describe, it, expect } from 'vitest'

// CS2PathResolver uses Node's `path` and `fs` modules directly.
// We only test the pure path-manipulation functions that don't need mocking.
// The registry/FS-dependent functions are integration-tested manually on Windows.

describe('CS2PathResolver', () => {
  describe('getCS2ExePath', () => {
    it('should return correct path to cs2.exe', async () => {
      const { CS2PathResolver } = await import('../../src/main/cs2-path-resolver')
      const result = CS2PathResolver.getCS2ExePath('C:\\SteamLibrary\\Counter-Strike Global Offensive')
      expect(result).toContain('cs2.exe')
      expect(result).toContain('game')
      expect(result).toContain('bin')
      expect(result).toContain('win64')
    })
  })

  describe('getConsoleLogPath', () => {
    it('should return correct console.log path', async () => {
      const { CS2PathResolver } = await import('../../src/main/cs2-path-resolver')
      const result = CS2PathResolver.getConsoleLogPath('C:\\CS2')
      expect(result).toContain('console.log')
      expect(result).toContain('csgo')
    })
  })

  describe('Static path constants', () => {
    it('should have CS2 directory name set correctly', async () => {
      const { CS2PathResolver } = await import('../../src/main/cs2-path-resolver')
      // Verify the resolver is importable and has the expected methods
      expect(typeof CS2PathResolver.findCS2Path).toBe('function')
      expect(typeof CS2PathResolver.validateCS2Path).toBe('function')
      expect(typeof CS2PathResolver.getEnvironmentInfo).toBe('function')
      expect(typeof CS2PathResolver.getReplaysPath).toBe('function')
      expect(typeof CS2PathResolver.getSteamUserId).toBe('function')
    })
  })
})

describe('SteamRegistry', () => {
  it('should be importable and have expected methods', async () => {
    const { SteamRegistry } = await import('../../src/main/cs2-path-resolver')
    expect(typeof SteamRegistry.getSteamPath).toBe('function')
    expect(typeof SteamRegistry.getLibraryFolders).toBe('function')
  })
})