import fs from 'fs/promises'
import path from 'path'

export interface HighlightSegment {
  id: string
  playerName: string
  tickStart: number
  tickEnd: number
  round: number
  type: string
}

export interface CombinedCfgConfig {
  highlights: HighlightSegment[]
  tickRate: number
  preRoll: number
  postRoll: number
  hostFramerate?: number // default 30
}

/**
 * Generate combined CFG content for all highlights in one CS2 session.
 */
export function buildCombinedCfgContent(config: CombinedCfgConfig): string {
  const hostFramerate = config.hostFramerate ?? 30
  const lines: string[] = []

  // Header
  lines.push('// CS2FragForge auto-generated combined autoexec.cfg')
  lines.push(`// Highlights: ${config.highlights.length}`)
  lines.push('')

  // Global settings
  lines.push('cl_draw_only_deathnotices 1')
  lines.push('r_drawviewmodel 0')
  lines.push(`host_framerate ${hostFramerate}`)
  lines.push('')

  // Generate highlight blocks
  for (let i = 0; i < config.highlights.length; i++) {
    const hl = config.highlights[i]
    const gotoTick = Math.max(0, hl.tickStart - config.preRoll * config.tickRate)
    const highlightDurationSec = (hl.tickEnd - hl.tickStart) / config.tickRate
    const totalDurationSec = config.preRoll + highlightDurationSec + config.postRoll
    const waitFrames = Math.ceil(totalDurationSec * hostFramerate)

    lines.push(`// Highlight ${i + 1}: ${hl.playerName} - ${hl.type} - Round ${hl.round}`)
    lines.push(`demo_gototick ${gotoTick}`)
    lines.push(`spec_player ${hl.playerName}`)
    lines.push(`wait ${waitFrames}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Write combined CFG for all highlights to autoexec.cfg.
 * Backs up existing autoexec.cfg if present.
 * Returns path to written file.
 */
export async function writeCombinedCfg(
  config: CombinedCfgConfig,
  cfgDir: string
): Promise<string> {
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
  await fs.writeFile(autoexecPath, buildCombinedCfgContent(config), 'utf-8')

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
