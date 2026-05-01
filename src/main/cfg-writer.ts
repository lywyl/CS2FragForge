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

/**
 * Write the Game State Integration config file to csgo/cfg/.
 * CS2 reads this on launch and starts sending HTTP POST payloads to the URI.
 * Returns the full path to the written file.
 */
export async function writeGsiCfg(
  cfgDir: string,
  cfgStem: string,
  gsiUri: string
): Promise<string> {
  await fs.mkdir(cfgDir, { recursive: true })
  const cfgPath = path.join(cfgDir, `gamestate_integration_${cfgStem}.cfg`)
  const content = [
    '"CS2FragForge"',
    '{',
    `  "uri" "${gsiUri}"`,
    '  "timeout" "1.0"',
    '  "buffer" "0.1"',
    '  "throttle" "0.1"',
    '  "heartbeat" "1.0"',
    '  "data"',
    '  {',
    '    "provider" "1"',
    '    "map" "1"',
    '    "round" "1"',
    '    "player_id" "1"',
    '    "player_state" "1"',
    '    "allplayers_id" "1"',
    '    "phase_countdowns" "1"',
    '  }',
    '}',
    ''
  ].join('\n')
  await fs.writeFile(cfgPath, content, 'utf-8')
  return cfgPath
}
