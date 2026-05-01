import http from 'http'

/**
 * CS2 Game State Integration (GSI) readiness detection.
 *
 * CS2 sends HTTP POST payloads to a local endpoint on every heartbeat.
 * We check if the payload indicates the player is in-game (not in menu/loading).
 *
 * Setup: write a gamestate_integration_*.cfg to CS2's cfg/ directory.
 * CS2 reads it on launch and starts sending POST requests to the configured URI.
 */

const GSI_CFG_CONTENT = `"CS2FragForge"
{
  "uri" "__URI__"
  "timeout" "1.0"
  "buffer" "0.1"
  "throttle" "0.1"
  "heartbeat" "1.0"
  "data"
  {
    "provider" "1"
    "map" "1"
    "round" "1"
    "player_id" "1"
    "player_state" "1"
    "allplayers_id" "1"
    "phase_countdowns" "1"
  }
}
`

let gsiServer: http.Server | null = null
let gsiReady = false
let gsiPort = 0

/**
 * Start a local HTTP server to receive CS2 GSI payloads.
 * Returns the port number the server is listening on.
 */
export function startGsiServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (gsiServer) {
      resolve(gsiPort)
      return
    }

    gsiReady = false
    const server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const payload = JSON.parse(body)
            if (isPayloadReady(payload)) {
              gsiReady = true
            }
          } catch {
            // ignore malformed payloads
          }
          res.writeHead(200)
          res.end()
        })
      } else {
        res.writeHead(200)
        res.end()
      }
    })

    server.listen(0, '127.0.0.1', () => {
      gsiPort = (server.address() as { port: number }).port
      gsiServer = server
      console.log(`[GSI] Server listening on http://127.0.0.1:${gsiPort}`)
      resolve(gsiPort)
    })

    server.on('error', (err) => {
      console.error('[GSI] Server error:', err.message)
      reject(err)
    })
  })
}

/**
 * Stop the GSI server.
 */
export function stopGsiServer(): void {
  if (gsiServer) {
    gsiServer.close()
    gsiServer = null
    gsiReady = false
    gsiPort = 0
  }
}

/**
 * Reset the ready state (call before launching CS2).
 */
export function resetGsiReady(): void {
  gsiReady = false
}

/**
 * Check if GSI has reported the player is in-game.
 */
export function isGsiReady(): boolean {
  return gsiReady
}

/**
 * Generate the GSI config file content for the given URI.
 */
export function buildGsiCfgContent(uri: string): string {
  return GSI_CFG_CONTENT.replace('__URI__', uri)
}

/**
 * Wait for GSI to report CS2 is ready, with timeout.
 * Returns true if ready, false if timed out.
 */
export function waitForGsiReady(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (gsiReady) {
      resolve(true)
      return
    }

    const startTime = Date.now()
    const interval = setInterval(() => {
      if (gsiReady) {
        clearInterval(interval)
        resolve(true)
        return
      }
      if (Date.now() - startTime >= timeoutMs) {
        clearInterval(interval)
        resolve(false)
        return
      }
    }, 200)
  })
}

/**
 * Check if a GSI payload indicates the player is in a demo/game.
 * Matches Insight Agent's _payload_has_demo_world() logic.
 */
function isPayloadReady(payload: Record<string, unknown>): boolean {
  const player = payload.player as Record<string, unknown> | undefined
  const map = payload.map as Record<string, unknown> | undefined
  const round = payload.round as Record<string, unknown> | undefined
  const allplayers = payload.allplayers as Record<string, unknown> | undefined

  if (!player) return false

  const activity = (player.activity as string) || ''

  // If in menu or loading, not ready
  if (activity === 'menu' || activity === 'loading') return false

  // If map has a valid phase, we're in-game
  if (map) {
    const phase = (map.phase as string) || ''
    if (['warmup', 'live', 'intermission', 'gameover', 'freezetime'].includes(phase)) {
      return true
    }
  }

  // If round data exists, we're in-game
  if (round && Object.keys(round).length > 0) {
    return true
  }

  // If allplayers data exists, we're in-game (spectating/demo)
  if (allplayers && Object.keys(allplayers).length > 0) {
    return true
  }

  // If player is actively playing/spectating/textinput with some map context
  if (['playing', 'textinput', 'spectating'].includes(activity) && map) {
    return true
  }

  return false
}
