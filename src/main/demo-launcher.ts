import { spawn, ChildProcess, execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { CS2PathResolver } from './cs2-path-resolver'

export class DemoLauncher {
  private cs2Process: ChildProcess | null = null
  private cs2Path: string
  private onExitCallback: ((code: number | null) => void) | null = null

  constructor(cs2Path: string) {
    this.cs2Path = cs2Path
  }

  async copyDemoToReplays(demoPath: string): Promise<string> {
    const replaysPath = CS2PathResolver.getReplaysPath(this.cs2Path)
    const demoName = path.basename(demoPath)
    const destPath = path.join(replaysPath, demoName)

    await fs.copyFile(demoPath, destPath)
    return demoName
  }

  /**
   * Launch CS2 bare-bones (no playdemo on command line).
   * All commands (playdemo, exec CFG) are injected via sendCommand() after
   * the engine initializes, since Source 2 may not handle +commands reliably.
   *
   * Uses windowed mode at 720p to avoid display mode switches and speed up startup.
   * -nobreakpad disables crash reporting overhead.
   */
  async launch(): Promise<void> {
    this.killExistingCS2()

    const cs2ExePath = CS2PathResolver.getCS2ExePath(this.cs2Path)

    const args = [
      '-steam',
      '-novid',
      '-nojoy',
      '-nosound',
      '-perfectworld',
      '-windowed',
      '-w', '1280',
      '-h', '720',
      '-nobreakpad'
    ]

    this.cs2Process = spawn(cs2ExePath, args, {
      detached: false,
      windowsHide: false,
      stdio: ['pipe', 'ignore', 'ignore']
    })

    this.cs2Process.on('error', (err) => {
      console.error('[DemoLauncher] CS2 process error:', err.message)
    })

    this.cs2Process.on('exit', (code) => {
      console.log(`[DemoLauncher] CS2 exited with code ${code}`)
      this.cs2Process = null
      this.onExitCallback?.(code)
    })
  }

  /**
   * Send a console command to the running CS2 process via stdin.
   * Acts as a safety fallback if +exec doesn't fire after playdemo.
   */
  sendCommand(command: string): void {
    if (!this.cs2Process || !this.cs2Process.stdin) {
      console.warn('[DemoLauncher] Cannot send command: CS2 process not running or stdin not available')
      return
    }
    try {
      this.cs2Process.stdin.write(command + '\n')
    } catch (err) {
      console.warn('[DemoLauncher] Failed to write to CS2 stdin:', err)
    }
  }

  onExit(callback: (code: number | null) => void): void {
    this.onExitCallback = callback
  }

  isRunning(): boolean {
    return this.cs2Process !== null && this.cs2Process.exitCode === null
  }

  async terminate(): Promise<void> {
    if (!this.cs2Process) return

    return new Promise<void>((resolve) => {
      const proc = this.cs2Process!
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {
          // process already dead
        }
        this.cs2Process = null
        resolve()
      }, 5000)

      proc.on('exit', () => {
        clearTimeout(timeout)
        this.cs2Process = null
        resolve()
      })

      try {
        proc.kill('SIGTERM')
      } catch {
        clearTimeout(timeout)
        this.cs2Process = null
        resolve()
      }
    })
  }

  private killExistingCS2(): void {
    try {
      execSync('taskkill /F /IM cs2.exe', { windowsHide: true, stdio: 'ignore' })
    } catch {
      // no existing cs2 process
    }
  }
}
