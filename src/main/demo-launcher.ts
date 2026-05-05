import { spawn, ChildProcess, execSync, exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { CS2PathResolver } from './cs2-path-resolver'
import { injectSingleCommand, findCs2Window } from './win-console-inject'

export class DemoLauncher {
  private cs2Process: ChildProcess | null = null
  private cs2Path: string
  private onExitCallback: ((code: number | null) => void) | null = null

  constructor(cs2Path: string) {
    this.cs2Path = cs2Path
  }

  /**
   * Copy demo to CS2's game/csgo/ directory (Source 2 requirement).
   * Uses a UUID-prefixed name to avoid collision and to match the CFG file stem.
   * Returns the stem (filename without .dem) used for both the CFG file and playdemo command.
   */
  async copyDemoToCsgo(demoPath: string, stem: string): Promise<string> {
    const csgoPath = CS2PathResolver.getCsgoPath(this.cs2Path)
    const destName = `${stem}.dem`
    const destPath = path.join(csgoPath, destName)

    await fs.copyFile(demoPath, destPath)
    return stem
  }

  /**
   * Launch CS2 with -console and +exec to run a startup CFG that handles
   * playdemo automatically. Steam environment variables are set so CS2
   * does not hang at the main menu when launched outside the Steam client.
   *
   * Source 2 uses Dear ImGui for the console and does NOT read from stdin,
   * so all initial commands must go through +exec on the command line.
   */
  async launch(cfgStem: string, resolution?: { width: number; height: number }): Promise<void> {
    this.killExistingCS2()

    const cs2ExePath = CS2PathResolver.getCS2ExePath(this.cs2Path)
    const gameDir = path.join(this.cs2Path, 'game')

    const args = [
      '-console',
      '-novid',
      '-nojoy',
      '-nosound',
      '-worldwide',
      '-fullscreen',
      '-w', String(resolution?.width ?? 1920),
      '-h', String(resolution?.height ?? 1080),
      '-nobreakpad',
      '-allow_third_party_software',
      '+engine_no_focus_sleep', '0',
      '+cl_demo_predict', '0',
      '+exec', cfgStem
    ]

    const childEnv = { ...process.env, SteamAppId: '730', SteamGameId: '730' }

    this.cs2Process = spawn(cs2ExePath, args, {
      cwd: gameDir,
      detached: false,
      windowsHide: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: childEnv
    })

    if (this.cs2Process.stderr) {
      let stderrBuf = ''
      this.cs2Process.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString()
      })
      this.cs2Process.on('close', () => {
        if (stderrBuf.trim()) {
          console.error('[DemoLauncher] CS2 stderr:', stderrBuf.trim().slice(0, 500))
        }
      })
    }

    this.cs2Process.on('error', (err) => {
      console.error('[DemoLauncher] CS2 process error:', err.message)
    })

    this.cs2Process.on('exit', (code, signal) => {
      console.log(`[DemoLauncher] CS2 exited with code=${code} signal=${signal}`)
      this.cs2Process = null
      this.onExitCallback?.(code)
    })
  }

  onExit(callback: (code: number | null) => void): void {
    this.onExitCallback = callback
  }

  isRunning(): boolean {
    return this.cs2Process !== null && this.cs2Process.exitCode === null
  }

  async terminate(): Promise<void> {
    // Prefer graceful quit via console; fall back to process-tree kill.
    // Insight Agent pattern: try quit first (console still responsive right after
    // recording), then taskkill /F /T /PID for the process tree, then /IM cs2.exe
    // as last resort, with window-disappearance polling between each step.
    try {
      const ok = await injectSingleCommand('quit')
      if (ok) {
        await new Promise(r => setTimeout(r, 3000))
      }
    } catch {
      // injection failed — fall through to process kill
    }

    // Kill process tree by PID (handles Steam launcher subprocesses)
    if (this.cs2Process && this.cs2Process.pid) {
      try {
        execSync(`taskkill /F /T /PID ${this.cs2Process.pid}`, {
          windowsHide: true, stdio: 'ignore', timeout: 10000
        })
      } catch { /* already dead */ }

      // Poll until CS2 window is gone
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const found = await findCs2Window()
        if (!found) break
        await new Promise(r => setTimeout(r, 200))
      }
    }

    // Last resort: kill any remaining cs2.exe instances
    try {
      execSync('taskkill /F /IM cs2.exe', {
        windowsHide: true, stdio: 'ignore', timeout: 10000
      })
    } catch { /* not running */ }

    this.cs2Process = null
  }

  private killExistingCS2(): void {
    try {
      execSync('taskkill /F /IM cs2.exe', { windowsHide: true, stdio: 'ignore' })
    } catch {
      // no existing cs2 process
    }
  }
}
