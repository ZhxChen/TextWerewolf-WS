// WebSocket chat anti-spam limiter.
// Keyed by username + roomId, so a player's cooldown follows them across sockets.
// In-process only, matching the current single-server deployment.
const CHAT_RATE_LIMIT_MS = 2000
const STALE_AFTER_MS = 10 * 60 * 1000

const store = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [key, lastAt] of store) {
    if (now - lastAt > STALE_AFTER_MS) store.delete(key)
  }
}, 60000).unref()

/**
 * @param {string} username
 * @param {string} roomId
 * @param {number} minIntervalMs
 * @returns {{ ok: boolean, retryAfterMs: number }}
 */
export function tryConsume(username, roomId, minIntervalMs = CHAT_RATE_LIMIT_MS) {
  if (username === undefined || username === null || username === '' || roomId === undefined || roomId === null || roomId === '') {
    return { ok: true, retryAfterMs: 0 }
  }

  const key = username + ':' + roomId
  const now = Date.now()
  const lastAt = store.get(key)
  if (lastAt === undefined) {
    store.set(key, now)
    return { ok: true, retryAfterMs: 0 }
  }

  const elapsed = now - lastAt
  if (elapsed < minIntervalMs) {
    return { ok: false, retryAfterMs: minIntervalMs - elapsed }
  }

  store.set(key, now)
  return { ok: true, retryAfterMs: 0 }
}

export { CHAT_RATE_LIMIT_MS }
