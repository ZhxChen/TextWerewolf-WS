import { User, SystemConfig } from '../models/index.js'
import { Result } from '../utils/response.js'
import { createPassword, checkPassword, createToken, isEmpty, storeToken, removeToken, removeUserTokens } from '../utils/helper.js'

export async function register(ctx) {
  const { username, password, name } = ctx.request.body
  if (isEmpty(username) || isEmpty(password) || isEmpty(name)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  if (username.length < 3 || username.length > 20) {
    ctx.body = Result.fail(-1, '用户名长度需在 3-20 个字符之间')
    return
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    ctx.body = Result.fail(-1, '用户名只能包含字母、数字和下划线')
    return
  }
  if (password.length < 6 || password.length > 50) {
    ctx.body = Result.fail(-1, '密码长度需在 6-50 个字符之间')
    return
  }
  if (name.length < 2 || name.length > 12) {
    ctx.body = Result.fail(-1, '昵称长度需在 2-12 个字符之间')
    return
  }
  const systemConfig = await SystemConfig.findOne()
  if (systemConfig && systemConfig.registrationOpen === false) {
    ctx.body = Result.fail(-1, '注册已关闭')
    return
  }
  const exists = await User.findOne({ username })
  if (exists) {
    ctx.body = Result.fail(-1, '用户名已存在')
    return
  }
  const hashedPassword = await createPassword(password)
  const user = await User.create({ username, password: hashedPassword, name, role: 'user' })
  const token = await createToken({ username: user.username, name: user.name, role: user.role })
  storeToken(token, user.username)
  ctx.body = Result.success({ token, username: user.username, name: user.name, role: user.role })
}

export async function getRegistrationStatus(ctx) {
  const systemConfig = await SystemConfig.findOne()
  ctx.body = Result.success({ registrationOpen: systemConfig?.registrationOpen !== false })
}

export async function changePassword(ctx) {
  const { oldPassword, newPassword } = ctx.request.body
  if (isEmpty(oldPassword) || isEmpty(newPassword)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  if (newPassword.length < 6 || newPassword.length > 50) {
    ctx.body = Result.fail(-1, '新密码长度需在 6-50 个字符之间')
    return
  }
  const user = await User.findOne({ username: ctx.userInfo.username })
  if (!user) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  const valid = await checkPassword(oldPassword, user.password)
  if (!valid) {
    ctx.body = Result.fail(-1, '原密码错误')
    return
  }
  user.password = await createPassword(newPassword)
  await user.save()
  // 密码变更后，清除该用户所有 token，强制重新登录
  removeUserTokens(user.username)
  ctx.body = Result.success('ok')
}

export async function updateProfile(ctx) {
  const { name } = ctx.request.body
  if (isEmpty(name) || name.length < 2 || name.length > 12) {
    ctx.body = Result.fail(-1, '昵称长度需在 2-12 个字符之间')
    return
  }
  const user = await User.findOne({ username: ctx.userInfo.username })
  if (!user) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  user.name = name
  await user.save()
  const token = await createToken({ username: user.username, name: user.name, role: user.role })
  storeToken(token, user.username)
  ctx.body = Result.success({ token, username: user.username, name: user.name, role: user.role })
}

export async function login(ctx) {
  const { username, password } = ctx.request.body
  if (isEmpty(username) || isEmpty(password)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const user = await User.findOne({ username })
  if (!user) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  if (user.status === 0) {
    ctx.body = Result.fail(-1, '账户已被禁用')
    return
  }
  const valid = await checkPassword(password, user.password)
  if (!valid) {
    ctx.body = Result.fail(-1, '密码错误')
    return
  }
  const token = await createToken({ username: user.username, name: user.name, role: user.role })
  storeToken(token, user.username)
  ctx.body = Result.success({ token, username: user.username, name: user.name, role: user.role })
}

export async function logout(ctx) {
  const raw = ctx.headers.authorization
  if (raw) {
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw
    removeToken(token)
  }
  ctx.body = Result.success('ok')
}
