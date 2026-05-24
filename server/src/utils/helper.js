import crypto from 'crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import config from '../config/index.js'
import { validTokens, revokedTokens } from '../state.js'
import { GAME_CAMP, GAME_DAY_NIGHT, GAME_ROLE, PLAYER_ROLE_MAP, STAGE_MAP } from '../config/constants.js'

export function isEmpty(obj) {
  return obj === null || obj === undefined || obj === ''
}

export function getRandomCode(l = 6) {
  const codeSet = '0123456789'
  let str = ''
  for (let i = 0; i < l; i += 1) {
    str += codeSet.charAt(Math.floor(Math.random() * codeSet.length))
  }
  return str
}

export function getRandomNumberArray(roleArray = []) {
  const list = [...roleArray]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list.map((role, index) => ({ number: index + 1, role })).sort((a, b) => a.number - b.number)
}

export function findMaxValue(arr = []) {
  const counter = arr.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1
    return acc
  }, {})
  let max = 0
  const result = []
  Object.entries(counter).forEach(([key, value]) => {
    if (value > max) {
      max = value
      result.length = 0
      result.push(key)
    } else if (value === max) {
      result.push(key)
    }
  })
  return result
}

export function hasElement(array = [], target) {
  if (!Array.isArray(array) || isEmpty(target)) return false
  return array.includes(target)
}

export function mapToArray(map) {
  if (!map || typeof map !== 'object') return []
  return Object.values(map)
}

export async function createPassword(password) {
  return bcrypt.hash(String(password), 10)
}

export async function checkPassword(password, dbPassword) {
  return bcrypt.compare(String(password), dbPassword)
}

export async function createToken(data) {
  return jwt.sign(data, config.jwt.secret, { expiresIn: config.jwt.expiresIn })
}

export async function checkToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

// 判断 token 是否已过有效期的一半（用于自动续签）
export function isTokenNearExpiry(payload) {
  if (!payload?.iat || !payload?.exp) return false
  const now = Math.floor(Date.now() / 1000)
  const mid = payload.iat + (payload.exp - payload.iat) / 2
  return now >= mid
}

// 将 token 存入 validTokens
export function storeToken(token, username) {
  const payload = jwt.decode(token)
  if (payload?.exp) {
    validTokens.set(token, { username, expiresAt: payload.exp * 1000 })
  }
}

// 移除指定 token（加入撤销列表，防止在当前会话内重用）
export function removeToken(token) {
  const entry = validTokens.get(token)
  validTokens.delete(token)
  const payload = entry ? null : jwt.decode(token)
  const expiresAt = entry?.expiresAt ?? (payload?.exp ? payload.exp * 1000 : Date.now() + 86_400_000)
  revokedTokens.set(token, expiresAt)
}

// 移除某用户的所有 token（加入撤销列表）
export function removeUserTokens(username) {
  for (const [token, entry] of validTokens) {
    if (entry.username === username) {
      validTokens.delete(token)
      revokedTokens.set(token, entry.expiresAt)
    }
  }
}

// 检查 token 是否在有效列表中
export function isTokenValid(token) {
  const now = Date.now()
  // Explicitly revoked tokens (logout/kick) are always rejected
  const revokedAt = revokedTokens.get(token)
  if (revokedAt !== undefined) {
    if (now > revokedAt) revokedTokens.delete(token) // clean up expired entry
    return false
  }
  const entry = validTokens.get(token)
  if (!entry) {
    // After a server restart, validTokens is cleared. Lazily accept tokens whose
    // JWT signature was already verified by checkToken (the caller) and are not expired.
    // Note: explicit revocations (logout/kick) issued before the restart are not preserved —
    // this was already the case since revokedTokens is also in-memory.
    const payload = jwt.decode(token)
    if (payload?.username && payload?.exp && now < payload.exp * 1000) {
      validTokens.set(token, { username: payload.username, expiresAt: payload.exp * 1000 })
      return true
    }
    return false
  }
  if (now > entry.expiresAt) {
    validTokens.delete(token)
    return false
  }
  return true
}

export function getPlayerNumberString(player) {
  return player ? `${player.position}号` : ''
}

export function getPlayerFullName(player, name) {
  if (!player || !player.username) return ''
  return `${player.position}号（${name || player.name}）`
}

export function findMaxInArray(array = []) {
  const counter = {}
  let max = 0
  let target = array[0]
  array.forEach((item) => {
    counter[item] = (counter[item] || 0) + 1
    if (counter[item] > max) {
      max = counter[item]
      target = item
    }
  })
  return target
}

export function getVisionKey(from, to) {
  if (!from || !to) return 0
  if (from.username === to.username) return 2
  if (from.role === GAME_ROLE.WOLF && to.role === GAME_ROLE.WOLF) return 2
  return 0
}

export function getCampByRole(role, useString = false) {
  const target = PLAYER_ROLE_MAP[role]
  if (!target) return null
  return useString ? target.campName : target.camp
}

export function getRoleName(role) {
  return PLAYER_ROLE_MAP[role]?.name || null
}

export function getSkillByKey(key, skills = []) {
  return skills.find((item) => item.key === key) || null
}

export function getDayAndNightString(stage, useString = false) {
  const target = STAGE_MAP[stage]
  if (!target) return ''
  return useString ? (target.day === GAME_DAY_NIGHT.IS_NIGHT ? '晚上' : '白天') : target.day
}

export function isOb(roomInstance, username) {
  return !!(roomInstance && username && Array.isArray(roomInstance.ob) && roomInstance.ob.includes(username))
}

export function getGameWinner(gameInstance) {
  if (gameInstance && gameInstance.winner > -1) {
    return `胜利者为：${gameInstance.winnerString}`
  }
  return '胜利者为：无效的游戏结果'
}
