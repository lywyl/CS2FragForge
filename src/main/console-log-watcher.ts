import fs from 'fs'

export interface ConsoleEvent {
  type: 'demo-loaded' | 'tick-reached' | 'error' | 'line'
  data?: string
  tick?: number
}

export class ConsoleLogWatcher {
  private fd: number | null = null
  private lastSize = 0
  private pollingInterval: ReturnType<typeof setInterval> | null = null
  private logPath: string
  private onEvent: (event: ConsoleEvent) => void
  private targetTick: number | null = null

  constructor(logPath: string, onEvent: (event: ConsoleEvent) => void) {
    this.logPath = logPath
    this.onEvent = onEvent
  }

  async start(targetTick?: number): Promise<void> {
    this.targetTick = targetTick ?? null

    // Wait for console.log to exist (CS2 creates it on launch)
    for (let i = 0; i < 20; i++) {
      try {
        this.fd = fs.openSync(this.logPath, 'r')
        const stat = fs.fstatSync(this.fd)
        this.lastSize = stat.size
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    if (this.fd === null) {
      this.onEvent({ type: 'error', data: 'console.log not found after 10s' })
      return
    }

    this.pollingInterval = setInterval(() => this.poll(), 500)
  }

  async stop(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd)
      } catch {
        // ignore
      }
      this.fd = null
    }
  }

  private poll(): void {
    if (this.fd === null) return

    try {
      const stat = fs.fstatSync(this.fd)
      if (stat.size <= this.lastSize) return

      const buf = Buffer.alloc(stat.size - this.lastSize)
      fs.readSync(this.fd, buf, 0, buf.length, this.lastSize)
      this.lastSize = stat.size

      const newContent = buf.toString('utf-8')
      const lines = newContent.split('\n').filter((l) => l.trim())

      for (const line of lines) {
        this.processLine(line)
      }
    } catch {
      // file may be locked by CS2
    }
  }

  private processLine(line: string): void {
    this.onEvent({ type: 'line', data: line })

    // CS2 demo loaded detection — check multiple patterns for robustness
    if (
      line.includes('Playing demo from') ||
      line.includes('Demo playback started') ||
      line.includes('Demo started') ||
      line.includes('Playback started') ||
      line.includes('CSGO Demo')
    ) {
      this.onEvent({ type: 'demo-loaded' })
    }
  }
}
