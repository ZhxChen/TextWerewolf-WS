import { Result } from '../utils/response.js'

const store = new Map()

// 定期清理过期记录，防止内存泄漏
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 60_000).unref()

/**
 * 基于 IP 的滑动窗口限流中间件
 * @param {object} options
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.max - 窗口内最大请求数
 * @param {string} options.message - 超限提示
 */
export function rateLimit({ windowMs = 60_000, max = 10, message = '请求过于频繁，请稍后再试' } = {}) {
  return async (ctx, next) => {
    const ip = ctx.get('X-Forwarded-For')?.split(',')[0]?.trim() || ctx.ip
    const key = `${ip}:${ctx.path}`
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++
    const remaining = Math.max(0, max - entry.count)

    ctx.set('X-RateLimit-Limit', String(max))
    ctx.set('X-RateLimit-Remaining', String(remaining))
    ctx.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > max) {
      ctx.status = 429
      ctx.body = Result.fail(-1, message)
      return
    }

    await next()
  }
}
