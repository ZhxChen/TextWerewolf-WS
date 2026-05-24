import NodeCache from 'node-cache'

export const timers = new Map()
export const advancingGames = new Set()
export const userSockets = new Map()
export const validTokens = new Map() // token → { username, expiresAt }
export const revokedTokens = new Map() // token → expiresAt (explicitly revoked)
export const cache = new NodeCache({ stdTTL: 0 }) // 0 = no expiry; timer data must never be silently evicted mid-game
export const playerStatus = new Map() // username → { online: bool, disconnectedAt: Date | null }
export const disconnectTimers = new Map() // username → timeout handle

// 定期清理过期 token
setInterval(() => {
  const now = Date.now()
  for (const [token, entry] of validTokens) {
    if (now > entry.expiresAt) validTokens.delete(token)
  }
  for (const [token, expiresAt] of revokedTokens) {
    if (now > expiresAt) revokedTokens.delete(token)
  }
}, 600_000).unref() // 每 10 分钟清理一次
export let io = null

export function setIo(ioInstance) {
  io = ioInstance
}
