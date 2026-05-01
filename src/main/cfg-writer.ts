import fs from 'fs/promises'
import path from 'path'

export interface LaunchCfgConfig {
  demoStem: string
  fpsMax?: number
}

/**
 * Generate the startup CFG executed via +exec on the CS2 command line.
 *
 * Contains only essential cvars and playdemo — no demo_gototick or
 * navigation commands. Per-clip seeking is done via PostMessage injection
 * after the demo loads, following the Insight Agent approach.
 */
export function buildLaunchCfgContent(config: LaunchCfgConfig): string {
  const fpsMax = config.fpsMax ?? 30
  const lines = [
    'con_enable 1',
    'engine_no_focus_sleep 0',
    'cl_demo_predict 0',
    `fps_max ${fpsMax}`,
    'bind "`" "toggleconsole"',
    `playdemo "${config.demoStem}.dem"`,
    ''
  ]
  return lines.join('\n')
}

/**
 * Write the launch CFG file to csgo/cfg/.
 * Returns the full path to the written file.
 */
export async function writeLaunchCfg(
  config: LaunchCfgConfig,
  cfgDir: string,
  cfgStem: string
): Promise<string> {
  await fs.mkdir(cfgDir, { recursive: true })
  const cfgPath = path.join(cfgDir, `${cfgStem}.cfg`)
  await fs.writeFile(cfgPath, buildLaunchCfgContent(config), 'utf-8')
  return cfgPath
}
