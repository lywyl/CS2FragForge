import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { buildCombinedCfgContent, writeCombinedCfg, restoreAutoexecCfg } from '../../src/main/cfg-writer'

describe('cfg-writer', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfg-writer-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('buildCombinedCfgContent', () => {
    it('should generate combined CFG with 1 highlight', () => {
      const content = buildCombinedCfgContent({
        highlights: [
          {
            id: 'hl-1',
            playerName: 's1mple',
            tickStart: 15234,
            tickEnd: 15554,
            round: 12,
            type: '4K'
          }
        ],
        tickRate: 64,
        preRoll: 2,
        postRoll: 2
      })

      expect(content).toContain('// CS2FragForge auto-generated combined autoexec.cfg')
      expect(content).toContain('// Highlights: 1')
      expect(content).toContain('cl_draw_only_deathnotices 1')
      expect(content).toContain('r_drawviewmodel 0')
      expect(content).toContain('host_framerate 30')
      expect(content).toContain('// Highlight 1: s1mple - 4K - Round 12')
      expect(content).toContain('spec_player s1mple')
      // gotoTick = max(0, 15234 - 2*64) = 15234 - 128 = 15106
      expect(content).toContain('demo_gototick 15106')
      // duration = (15554-15234)/64 = 5 sec
      // total = 2 + 5 + 2 = 9 sec
      // wait = ceil(9 * 30) = 270
      expect(content).toContain('wait 270')
    })

    it('should generate combined CFG with 3 highlights', () => {
      const content = buildCombinedCfgContent({
        highlights: [
          {
            id: 'hl-1',
            playerName: 's1mple',
            tickStart: 10000,
            tickEnd: 10640,
            round: 5,
            type: '3K'
          },
          {
            id: 'hl-2',
            playerName: 'ZywOo',
            tickStart: 20000,
            tickEnd: 20960,
            round: 8,
            type: 'CLUTCH_1V3'
          },
          {
            id: 'hl-3',
            playerName: 'NiKo',
            tickStart: 30000,
            tickEnd: 31280,
            round: 15,
            type: 'ACE'
          }
        ],
        tickRate: 64,
        preRoll: 3,
        postRoll: 2
      })

      expect(content).toContain('// Highlights: 3')
      expect(content).toContain('// Highlight 1: s1mple - 3K - Round 5')
      expect(content).toContain('// Highlight 2: ZywOo - CLUTCH_1V3 - Round 8')
      expect(content).toContain('// Highlight 3: NiKo - ACE - Round 15')
      expect(content).toContain('spec_player s1mple')
      expect(content).toContain('spec_player ZywOo')
      expect(content).toContain('spec_player NiKo')

      // hl-1: gotoTick = max(0, 10000 - 3*64) = 10000 - 192 = 9808
      expect(content).toContain('demo_gototick 9808')
      // hl-2: gotoTick = max(0, 20000 - 192) = 19808
      expect(content).toContain('demo_gototick 19808')
      // hl-3: gotoTick = max(0, 30000 - 192) = 29808
      expect(content).toContain('demo_gototick 29808')
    })

    it('should clamp gotoTick to 0 when preRoll exceeds tickStart', () => {
      const content = buildCombinedCfgContent({
        highlights: [
          {
            id: 'hl-1',
            playerName: 's1mple',
            tickStart: 100,
            tickEnd: 500,
            round: 1,
            type: 'ENTRY'
          }
        ],
        tickRate: 64,
        preRoll: 5,
        postRoll: 2
      })

      // gotoTick = max(0, 100 - 5*64) = max(0, 100 - 320) = max(0, -220) = 0
      expect(content).toContain('demo_gototick 0')
    })

    it('should calculate wait frames correctly for 64 tick', () => {
      const content = buildCombinedCfgContent({
        highlights: [
          {
            id: 'hl-1',
            playerName: 's1mple',
            tickStart: 10000,
            tickEnd: 10640,
            round: 5,
            type: '3K'
          }
        ],
        tickRate: 64,
        preRoll: 2,
        postRoll: 3,
        hostFramerate: 64
      })

      // duration = (10640-10000)/64 = 10 sec
      // total = 2 + 10 + 3 = 15 sec
      // wait = ceil(15 * 64) = 960
      expect(content).toContain('wait 960')
    })

    it('should calculate wait frames correctly for 128 tick', () => {
      const content = buildCombinedCfgContent({
        highlights: [
          {
            id: 'hl-1',
            playerName: 's1mple',
            tickStart: 25600,
            tickEnd: 26880,
            round: 10,
            type: '4K'
          }
        ],
        tickRate: 128,
        preRoll: 2,
        postRoll: 2,
        hostFramerate: 128
      })

      // duration = (26880-25600)/128 = 10 sec
      // total = 2 + 10 + 2 = 14 sec
      // wait = ceil(14 * 128) = 1792
      expect(content).toContain('wait 1792')
    })

    it('should use default hostFramerate of 30 when not specified', () => {
      const content = buildCombinedCfgContent({
        highlights: [
          {
            id: 'hl-1',
            playerName: 's1mple',
            tickStart: 10000,
            tickEnd: 10640,
            round: 5,
            type: '3K'
          }
        ],
        tickRate: 64,
        preRoll: 2,
        postRoll: 2
      })

      expect(content).toContain('host_framerate 30')
    })
  })

  describe('writeCombinedCfg', () => {
    it('should write combined CFG to file', async () => {
      const cfgPath = await writeCombinedCfg(
        {
          highlights: [
            {
              id: 'hl-1',
              playerName: 's1mple',
              tickStart: 15234,
              tickEnd: 15554,
              round: 12,
              type: '4K'
            }
          ],
          tickRate: 64,
          preRoll: 2,
          postRoll: 2
        },
        tmpDir
      )

      expect(cfgPath).toBe(path.join(tmpDir, 'autoexec.cfg'))
      const content = await fs.readFile(cfgPath, 'utf-8')
      expect(content).toContain('// CS2FragForge auto-generated combined autoexec.cfg')
      expect(content).toContain('demo_gototick 15106')
    })

    it('should backup existing autoexec.cfg', async () => {
      const autoexecPath = path.join(tmpDir, 'autoexec.cfg')
      const backupPath = path.join(tmpDir, 'autoexec.cfg.cs2fragforge.bak')

      // Create existing autoexec.cfg
      await fs.writeFile(autoexecPath, '// Original autoexec\nexec config.cfg\n', 'utf-8')

      await writeCombinedCfg(
        {
          highlights: [
            {
              id: 'hl-1',
              playerName: 's1mple',
              tickStart: 10000,
              tickEnd: 10640,
              round: 5,
              type: '3K'
            }
          ],
          tickRate: 64,
          preRoll: 2,
          postRoll: 2
        },
        tmpDir
      )

      // Backup should exist
      const backupContent = await fs.readFile(backupPath, 'utf-8')
      expect(backupContent).toContain('// Original autoexec')

      // New autoexec should have our content
      const newContent = await fs.readFile(autoexecPath, 'utf-8')
      expect(newContent).toContain('// CS2FragForge auto-generated combined autoexec.cfg')
    })
  })

  describe('restoreAutoexecCfg', () => {
    it('should restore backup when it exists', async () => {
      const autoexecPath = path.join(tmpDir, 'autoexec.cfg')
      const backupPath = path.join(tmpDir, 'autoexec.cfg.cs2fragforge.bak')

      // Create backup
      await fs.writeFile(backupPath, '// Original autoexec\n', 'utf-8')
      // Create our autoexec
      await fs.writeFile(autoexecPath, '// Our autoexec\n', 'utf-8')

      await restoreAutoexecCfg(tmpDir)

      // Should be restored
      const content = await fs.readFile(autoexecPath, 'utf-8')
      expect(content).toContain('// Original autoexec')

      // Backup should be removed
      await expect(fs.access(backupPath)).rejects.toThrow()
    })

    it('should remove autoexec when no backup exists', async () => {
      const autoexecPath = path.join(tmpDir, 'autoexec.cfg')

      // Create our autoexec (no backup)
      await fs.writeFile(autoexecPath, '// Our autoexec\n', 'utf-8')

      await restoreAutoexecCfg(tmpDir)

      // Should be removed
      await expect(fs.access(autoexecPath)).rejects.toThrow()
    })
  })
})
