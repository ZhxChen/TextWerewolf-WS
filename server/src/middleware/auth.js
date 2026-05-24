import { User } from '../models/index.js'
import { checkToken, isTokenNearExpiry, isTokenValid, createToken, storeToken } from '../utils/helper.js'
import { Result } from '../utils/response.js'

export const auth = async (ctx, next) => {
  const raw = ctx.headers.authorization
  if (!raw) {
    ctx.body = Result.fail(-3, '未登录')
    return
  }
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw
  if (!token) {
    ctx.body = Result.fail(-3, '未登录')
    return
  }
  try {
    const payload = await checkToken(token)
    if (!payload?.username) {
      ctx.body = Result.fail(-3, 'token无效或已过期')
      return
    }
    // 服务端 token 校验：被踢出/禁用/登出的 token 会被移除
    if (!isTokenValid(token)) {
      ctx.body = Result.fail(-3, 'token已失效，请重新登录')
      return
    }
    const user = await User.findOne({ username: payload.username }).select('username name role status')
    if (!user) {
      ctx.body = Result.fail(-3, 'token无效或已过期')
      return
    }
    if (user.status === 0) {
      ctx.body = Result.fail(-3, '账户已被禁用')
      return
    }
    ctx.userInfo = {
      username: user.username,
      name: user.name,
      role: user.role,
      status: user.status
    }
    // 自动续签：token 过半有效期时签发新 token
    if (isTokenNearExpiry(payload)) {
      const newToken = await createToken({ username: user.username, name: user.name, role: user.role })
      storeToken(newToken, user.username)
      ctx.set('X-Token-Refresh', newToken)
    }
    await next()
  } catch (e) {
    ctx.body = Result.fail(-3, 'token无效或已过期')
  }
}

export const requireAdmin = async (ctx, next) => {
  if (ctx.userInfo?.role !== 'admin') {
    ctx.body = Result.fail(-4, '权限不足')
    return
  }
  await next()
}
