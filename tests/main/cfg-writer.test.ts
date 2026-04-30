import { describe, it, expect } from 'vitest'
import { buildCfgContent } from '../../src/main/cfg-writer'

describe('cfg-writer', () => {
  const defaultConfig = {
    tickStart: 10000,
    tickRate: 64,
    playerName: 's1mple',
    preRoll: 5,
    highlightId: 'test-hl-1',
    movieFilename: 'cs2fragforge_test-hl-1'
  }

  describe('buildCfgContent', () => {
    it('should include clean HUD commands', () => {
      const content = buildCfgContent(defaultConfig)
      expect(content).toContain('cl_draw_only_deathnotices 1')
      expect(content).toContain('r_drawviewmodel 0')
    })

    it('should include demo_gototick with pre-roll offset', () => {
      const content = buildCfgContent(defaultConfig)
      // preRoll=5, tickRate=64, so preRollTicks = 320
      // gotoTick = 10000 - 320 = 9680
      expect(content).toContain('demo_gototick 9680')
    })

    it('should clamp gotoTick to 0 when preRoll exceeds tickStart', () => {
      const config = { ...defaultConfig, tickStart: 100, preRoll: 5 }
      const content = buildCfgContent(config)
      expect(content).toContain('demo_gototick 0')
    })

    it('should include spec_player with player name', () => {
      const content = buildCfgContent(defaultConfig)
      expect(content).toContain('spec_player s1mple')
    })

    it('should include host_framerate and startmovie', () => {
      const content = buildCfgContent(defaultConfig)
      expect(content).toContain('host_framerate 30')
      expect(content).toContain('startmovie cs2fragforge_test-hl-1 h264')
    })

    it('should include highlight ID in comment', () => {
      const content = buildCfgContent(defaultConfig)
      expect(content).toContain('test-hl-1')
    })

    it('should handle 128 tick rate', () => {
      const config = { ...defaultConfig, tickRate: 128, tickStart: 50000 }
      const content = buildCfgContent(config)
      // preRollTicks = 5 * 128 = 640
      // gotoTick = 50000 - 640 = 49360
      expect(content).toContain('demo_gototick 49360')
    })
  })
})
