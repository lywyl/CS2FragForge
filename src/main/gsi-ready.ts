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
let latestPayload: Record<string, unknown> | null = null
let latestPayloadTimestamp = 0

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
            latestPayload = payload
            latestPayloadTimestamp = Date.now()
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
    latestPayload = null
  }
}

/**
 * Reset the ready state (call before launching CS2).
 */
export function resetGsiReady(): void {
  gsiReady = false
  latestPayload = null
  latestPayloadTimestamp = 0
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

/**
 * Get the most recent GSI payload received from CS2.
 */
export function getLatestGsiPayload(): Record<string, unknown> | null {
  return latestPayload
}

/**
 * Extract the currently spectated player's steamid from the latest GSI payload.
 * In CS2 GSI, when spectating a player in demo, the `player.steamid` field
 * reflects the steamid of the player currently being observed.
 *
 * Used for active spec slot calibration: iterate slots, read steamid per slot.
 */
export function getLatestGsiTimestamp(): number {
  return latestPayloadTimestamp
}

export function getCurrentGsiPlayerSteamId(): string | null {
  if (!latestPayload) return null
  const player = latestPayload.player as Record<string, unknown> | undefined
  if (!player) return null
  const sid = player.steamid
  return sid ? String(sid) : null
}

/**
 * Block until a fresh GSI payload arrives after the given timestamp.
 * Returns the steamid of the currently spectated player, or null on timeout.
 */
export function awaitFreshGsiSteamId(
  afterTimestamp: number,
  timeoutMs: number = 2000
): Promise<string | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = (): void => {
      // Only use payloads received after the given timestamp (fresh data)
      if (latestPayloadTimestamp > afterTimestamp && latestPayload) {
        const player = latestPayload.player as Record<string, unknown> | undefined
        if (player) {
          const sid = player.steamid
          if (sid) {
            resolve(String(sid))
            return
          }
        }
      }
      if (Date.now() >= deadline) {
        resolve(null)
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}

/**
 * Wait for a GSI payload containing allplayers with observer_slot and steamid.
 * Returns a Map<steamid_string, observer_slot_number>.
 *
 * This is used for spec_player calibration: CS2's spec_player command requires
 * a numeric slot index, not a player name. The GSI allplayers data maps
 * steamid -> observer_slot so we can translate player identities to slot numbers.
 */
export function awaitGsiAllplayerSlots(timeoutMs: number): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    const startTime = Date.now()

    const check = (): void => {
      const mapping = extractAllplayerSlots(latestPayload)
      if (mapping.size > 0) {
        resolve(mapping)
        return
      }
      if (Date.now() - startTime >= timeoutMs) {
        resolve(new Map())
        return
      }
      setTimeout(check, 200)
    }

    check()
  })
}

/**
 * Extract steamid -> observer_slot mapping from a GSI payload.
 *
 * CS2 GSI allplayers object: keys are slot numbers ("0","1",...),
 * values contain steamid, name, observer_slot, etc.
 * We prefer observer_slot field, fall back to the key itself.
 *
 * If any observer_slot is 0 (0-based indexing), we add +1 to all slots
 * so they match the 1-based numbering expected by console spec_player.
 * This mirrors the Insight Agent's offset logic in _gsi_allplayer_spec_slots.
 */
function extractAllplayerSlots(payload: Record<string, unknown> | null): Map<string, number> {
  const mapping = new Map<string, number>()
  if (!payload) return mapping

  const allplayers = payload.allplayers as Record<string, Record<string, unknown>> | undefined
  if (!allplayers) return mapping

  for (const [key, playerData] of Object.entries(allplayers)) {
    const steamid = String(playerData.steamid ?? '')
    if (!steamid) continue

    // Prefer observer_slot field, fall back to allplayers key (which IS the slot number)
    const slot = typeof playerData.observer_slot === 'number'
      ? playerData.observer_slot
      : parseInt(key, 10)

    if (!isNaN(slot)) {
      mapping.set(steamid, slot)
    }
  }

  // Offset correction: if any slot is 0-based, shift all to 1-based
  let needsOffset = false
  mapping.forEach((slot) => {
    if (slot === 0) needsOffset = true
  })
  if (needsOffset) {
    mapping.forEach((slot, sid) => {
      mapping.set(sid, slot + 1)
    })
  }

  return mapping
}
