import { spawn, ChildProcess, execSync } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export class PythonBridge {
  private process: ChildProcess | null = null
  private port: number = 8765
  private pythonPath: string | null = null
  private pythonDir: string | null = null

  private resolvePythonPaths(): { python: string; cwd: string } {
    if (this.pythonPath && this.pythonDir) {
      return { python: this.pythonPath, cwd: this.pythonDir }
    }

    const isPackaged = app.isPackaged

    if (isPackaged) {
      // In packaged app, look for embedded Python in resources
      const embedDir = path.join(process.resourcesPath, 'python-embed')
      const srcDir = path.join(process.resourcesPath, 'python')

      // Try embedded Python first
      const embedPython = path.join(embedDir, 'python.exe')
      if (fs.existsSync(embedPython)) {
        this.pythonPath = embedPython
        this.pythonDir = srcDir
        return { python: this.pythonPath, cwd: this.pythonDir }
      }

      // Fallback: try system Python
      try {
        const systemPython = execSync('where python', { encoding: 'utf-8' }).trim().split('\n')[0]
        if (systemPython && fs.existsSync(systemPython)) {
          this.pythonPath = systemPython
          this.pythonDir = srcDir
          return { python: this.pythonPath, cwd: this.pythonDir }
        }
      } catch {
        // Python not found in PATH
      }

      // Last resort: look for python in resources root
      const resourcePython = path.join(process.resourcesPath, 'python.exe')
      if (fs.existsSync(resourcePython)) {
        this.pythonPath = resourcePython
        this.pythonDir = process.resourcesPath
        return { python: this.pythonPath, cwd: this.pythonDir }
      }

      throw new Error(
        'Python not found. Please install Python 3.11+ or place python-embed folder in resources.'
      )
    }

    // Development mode
    const venvPython = path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
    if (fs.existsSync(venvPython)) {
      this.pythonPath = venvPython
      this.pythonDir = path.join(__dirname, '..', '..')
      return { python: this.pythonPath, cwd: this.pythonDir }
    }

    // Fallback to system Python in dev
    try {
      const systemPython = execSync('where python', { encoding: 'utf-8' }).trim().split('\n')[0]
      if (systemPython) {
        this.pythonPath = systemPython
        this.pythonDir = path.join(__dirname, '..', '..')
        return { python: this.pythonPath, cwd: this.pythonDir }
      }
    } catch {
      // ignore
    }

    throw new Error('Python not found. Please set up .venv or install Python 3.11+.')
  }

  async start(): Promise<void> {
    if (this.process) return

    const { python, cwd } = this.resolvePythonPaths()

    // In packaged mode, we need to set PYTHONPATH so Python can find our modules
    const env = { ...process.env }
    if (app.isPackaged) {
      const srcDir = path.join(process.resourcesPath, 'python')
      env.PYTHONPATH = srcDir
    }

    this.process = spawn(python, ['-m', 'uvicorn', 'src.python.main:app', '--host', '127.0.0.1', '--port', String(this.port)], {
      cwd: cwd,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Log stdout/stderr for debugging
    this.process.stdout?.on('data', (data: Buffer) => {
      console.log(`[Python] ${data.toString().trim()}`)
    })
    this.process.stderr?.on('data', (data: Buffer) => {
      console.warn(`[Python] ${data.toString().trim()}`)
    })

    return new Promise((resolve, reject) => {
      this.process!.on('error', (err) => {
        console.error('Python process error:', err)
        reject(err)
      })

      this.process!.on('exit', (code) => {
        if (code !== null && code !== 0) {
          console.error(`Python process exited with code ${code}`)
        }
        this.process = null
      })

      // Wait for server to start, then verify with health check
      setTimeout(async () => {
        try {
          const healthy = await this.health()
          if (healthy) {
            resolve()
          } else {
            // Wait a bit more and try again
            setTimeout(async () => {
              const healthy2 = await this.health()
              if (healthy2) {
                resolve()
              } else {
                reject(new Error('Python server failed to start'))
              }
            }, 2000)
          }
        } catch (err) {
          reject(err)
        }
      }, 2000)
    })
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.port}/health`)
      const data = await response.json()
      return data.status === 'ok'
    } catch {
      return false
    }
  }

  getUrl(): string {
    return `http://localhost:${this.port}`
  }

  getPort(): number {
    return this.port
  }
}
