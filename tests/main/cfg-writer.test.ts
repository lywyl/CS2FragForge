import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { buildLaunchCfgContent, writeLaunchCfg } from '../../src/main/cfg-writer'

describe('cfg-writer', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfg-writer-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('buildLaunchCfgContent', () => {
    it('should generate launch CFG with playdemo and essential cvars', () => {
      const content = buildLaunchCfgContent({
        demoStem: 'test_demo',
        fpsMax: 30
      })

      expect(content).toContain('con_enable 1')
      expect(content).toContain('engine_no_focus_sleep 0')
      expect(content).toContain('cl_demo_predict 0')
      expect(content).toContain('fps_max 30')
      expect(content).toContain('playdemo "test_demo.dem"')
    })

    it('should use default fpsMax of 30', () => {
      const content = buildLaunchCfgContent({ demoStem: 'test_demo' })
      expect(content).toContain('fps_max 30')
    })

    it('should use custom fpsMax when specified', () => {
      const content = buildLaunchCfgContent({ demoStem: 'test_demo', fpsMax: 60 })
      expect(content).toContain('fps_max 60')
    })

    it('should contain backtick console bind', () => {
      const content = buildLaunchCfgContent({ demoStem: 'test_demo' })
      expect(content).toContain('bind "`" "toggleconsole"')
    })

    it('should not contain navigation commands', () => {
      const content = buildLaunchCfgContent({ demoStem: 'test_demo' })
      expect(content).not.toContain('demo_gototick')
      expect(content).not.toContain('spec_player')
      expect(content).not.toContain('wait')
      expect(content).not.toContain('alias')
    })
  })

  describe('writeLaunchCfg', () => {
    it('should write launch CFG to file', async () => {
      const cfgPath = await writeLaunchCfg(
        { demoStem: 'test_demo', fpsMax: 30 },
        tmpDir,
        'test_demo'
      )

      expect(cfgPath).toBe(path.join(tmpDir, 'test_demo.cfg'))
      const content = await fs.readFile(cfgPath, 'utf-8')
      expect(content).toContain('con_enable 1')
      expect(content).toContain('playdemo "test_demo.dem"')
    })
  })
})
