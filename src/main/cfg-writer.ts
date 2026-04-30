import fs from 'fs/promises'
import path from 'path'

export interface CfgConfig {
  tickStart: number
  tickRate: number
  playerName: string
  preRoll: number
  highlightId: string
  movieFilename: string
}

export function buildCfgContent(config: CfgConfig): string {
  const preRollTicks = Math.round(config.preRoll * config.tickRate)
  const gotoTick = Math.max(0, config.tickStart - preRollTicks)

  return [
    `// CS2FragForge auto-generated CFG for highlight ${config.highlightId}`,
    `// Player: ${config.playerName}, Tick: ${config.tickStart}`,
    '',
    '// Clean HUD',
    'cl_draw_only_deathnotices 1',
    'r_drawviewmodel 0',
    '',
    '// Navigate to highlight start (with pre-roll)',
    `demo_gototick ${gotoTick}`,
    '',
    '// Spectate the highlight player',
    `spec_player ${config.playerName}`,
    '',
    '// Recording setup',
    'host_framerate 30',
    `startmovie ${config.movieFilename} h264`
  ].join('\n') + '\n'
}

export async function writeHighlightCfg(config: CfgConfig, cfgDir: string): Promise<string> {
  const cfgName = `cs2fragforge_${config.highlightId}.cfg`
  const cfgPath = path.join(cfgDir, cfgName)

  await fs.mkdir(cfgDir, { recursive: true })
  await fs.writeFile(cfgPath, buildCfgContent(config), 'utf-8')

  return cfgPath
}

/**
 * Write commands to autoexec.cfg which CS2 always loads on startup.
 * More reliable than +exec launch parameter.
 * Returns the path to autoexec.cfg.
 */
export async function writeAutoexecCfg(config: CfgConfig, cfgDir: string): Promise<string> {
  const autoexecPath = path.join(cfgDir, 'autoexec.cfg')

  // Backup existing autoexec.cfg if present
  try {
    await fs.access(autoexecPath)
    const backupPath = path.join(cfgDir, 'autoexec.cfg.cs2fragforge.bak')
    await fs.copyFile(autoexecPath, backupPath)
  } catch {
    // No existing autoexec.cfg, fine
  }

  await fs.mkdir(cfgDir, { recursive: true })
  await fs.writeFile(autoexecPath, buildCfgContent(config), 'utf-8')

  return autoexecPath
}

/**
 * Restore the original autoexec.cfg from backup if it exists.
 */
export async function restoreAutoexecCfg(cfgDir: string): Promise<void> {
  const autoexecPath = path.join(cfgDir, 'autoexec.cfg')
  const backupPath = path.join(cfgDir, 'autoexec.cfg.cs2fragforge.bak')

  try {
    await fs.access(backupPath)
    await fs.copyFile(backupPath, autoexecPath)
    await fs.unlink(backupPath)
  } catch {
    // No backup, just remove our autoexec
    try {
      await fs.unlink(autoexecPath)
    } catch {
      // ignore
    }
  }
}
