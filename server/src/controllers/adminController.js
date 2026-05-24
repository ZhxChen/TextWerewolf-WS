import { User, Room, SystemConfig } from '../models/index.js'
import { Result } from '../utils/response.js'
import { io, userSockets } from '../state.js'
import { createPassword, isEmpty, removeUserTokens } from '../utils/helper.js'
import { ROOM_STATUS } from '../config/constants.js'

async function getOrCreateSystemConfig() {
  let config = await SystemConfig.findOne()
  if (!config) {
    config = await SystemConfig.create({})
  }
  return config
}

export async function listUsers(ctx) {
  const { username } = ctx.query
  const query = {}
  if (!isEmpty(username)) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.username = new RegExp(escaped, 'i')
  }
  const users = await User.find(query).select('-password').sort({ createdAt: 1 })
  ctx.body = Result.success(users)
}

export async function updateUserRole(ctx) {
  const { id } = ctx.params
  const { role } = ctx.request.body
  if (!['admin', 'user'].includes(role)) {
    ctx.body = Result.fail(-1, '无效的角色')
    return
  }
  const targetUser = await User.findById(id)
  if (!targetUser) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  if (targetUser.username === ctx.userInfo.username) {
    ctx.body = Result.fail(-1, '不能修改自己的角色')
    return
  }
  targetUser.role = role
  await targetUser.save()
  ctx.body = Result.success('ok')
}

export async function updateUserPassword(ctx) {
  const { id } = ctx.params
  const { password } = ctx.request.body
  if (isEmpty(password)) {
    ctx.body = Result.fail(-1, '密码不能为空')
    return
  }
  const targetUser = await User.findById(id)
  if (!targetUser) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  targetUser.password = await createPassword(password)
  await targetUser.save()
  removeUserTokens(targetUser.username)
  const socket = userSockets.get(targetUser.username)
  if (socket) {
    socket.disconnect(true)
    userSockets.delete(targetUser.username)
  }
  ctx.body = Result.success('ok')
}

export async function updateUserStatus(ctx) {
  const { id } = ctx.params
  const status = Number(ctx.request.body?.status)
  if (![0, 1].includes(status)) {
    ctx.body = Result.fail(-1, '无效的状态')
    return
  }
  const targetUser = await User.findById(id)
  if (!targetUser) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  if (targetUser.username === ctx.userInfo.username) {
    ctx.body = Result.fail(-1, '不能修改自己的状态')
    return
  }
  targetUser.status = status
  await targetUser.save()
  if (status === 0) {
    removeUserTokens(targetUser.username)
    const socket = userSockets.get(targetUser.username)
    if (socket) {
      socket.disconnect(true)
      userSockets.delete(targetUser.username)
    }
  }
  ctx.body = Result.success('ok')
}

export async function kickUser(ctx) {
  const { id } = ctx.params
  const targetUser = await User.findById(id).select('username')
  if (!targetUser) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  const socket = userSockets.get(targetUser.username)
  if (!socket) {
    ctx.body = Result.fail(-1, '用户当前不在线')
    return
  }
  socket.disconnect(true)
  userSockets.delete(targetUser.username)
  removeUserTokens(targetUser.username)
  ctx.body = Result.success('ok')
}

export async function deleteUser(ctx) {
  const { id } = ctx.params
  const targetUser = await User.findById(id)
  if (!targetUser) {
    ctx.body = Result.fail(-1, '用户不存在')
    return
  }
  if (targetUser.username === ctx.userInfo.username) {
    ctx.body = Result.fail(-1, '不能删除自己')
    return
  }
  // Kick online user first
  const socket = userSockets.get(targetUser.username)
  if (socket) {
    socket.disconnect(true)
    userSockets.delete(targetUser.username)
  }
  removeUserTokens(targetUser.username)
  // Clear seats in all rooms
  const rooms = await Room.find({ seats: targetUser.username })
  for (const room of rooms) {
    room.seats = room.seats.map((s) => (s === targetUser.username ? null : s))
    await room.save()
  }
  if (rooms.length > 0) io?.to('lobby').emit('refreshLobby')
  await User.findByIdAndDelete(id)
  ctx.body = Result.success('ok')
}

export async function createUser(ctx) {
  const { username, password, name, role } = ctx.request.body
  if (isEmpty(username) || isEmpty(password) || isEmpty(name)) {
    ctx.body = Result.fail(-1, '用户名、密码、昵称不能为空')
    return
  }
  const existing = await User.findOne({ username })
  if (existing) {
    ctx.body = Result.fail(-1, '用户名已存在')
    return
  }
  const validRole = ['admin', 'user'].includes(role) ? role : 'user'
  const hashedPassword = await createPassword(password)
  const user = await User.create({ username, password: hashedPassword, name, role: validRole, status: 1 })
  const userObj = user.toObject()
  delete userObj.password
  ctx.body = Result.success(userObj)
}

export async function batchCreateUsers(ctx) {
  const { users } = ctx.request.body
  if (!Array.isArray(users) || users.length === 0) {
    ctx.body = Result.fail(-1, '用户列表不能为空')
    return
  }
  if (users.length > 50) {
    ctx.body = Result.fail(-1, '单次最多导入 50 条')
    return
  }

  const errors = []
  const validUsers = []
  for (const u of users) {
    if (isEmpty(u.username) || isEmpty(u.password) || isEmpty(u.name)) {
      errors.push({ username: u.username || '(未知)', reason: '必填字段缺失' })
    } else {
      validUsers.push(u)
    }
  }

  const allUsernames = validUsers.map((u) => u.username)
  const existingUsers = await User.find({ username: { $in: allUsernames } }).select('username')
  const existingSet = new Set(existingUsers.map((u) => u.username))

  const toCreate = []
  const skipped = []
  for (const u of validUsers) {
    if (existingSet.has(u.username)) {
      skipped.push({ username: u.username, reason: '用户名已存在' })
    } else {
      toCreate.push(u)
    }
  }

  const created = []
  for (const u of toCreate) {
    const validRole = ['admin', 'user'].includes(u.role) ? u.role : 'user'
    const hashedPassword = await createPassword(u.password)
    await User.create({ username: u.username, password: hashedPassword, name: u.name, role: validRole, status: 1 })
    created.push({ username: u.username, name: u.name })
  }

  ctx.body = Result.success({ created, skipped, errors })
}

export async function getSystemConfig(ctx) {
  const config = await getOrCreateSystemConfig()
  ctx.body = Result.success(config)
}

export async function updateSystemConfig(ctx) {
  const config = await getOrCreateSystemConfig()
  const allowedFields = ['registrationOpen']
  for (const key of allowedFields) {
    if (key in (ctx.request.body || {})) {
      config[key] = ctx.request.body[key]
    }
  }
  await config.save()
  ctx.body = Result.success(config)
}

export async function adminDeleteRoom(ctx) {
  const { id } = ctx.params
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  io?.to('room:' + id).emit('roomDeleted')
  io?.to('lobby').emit('refreshLobby')
  await Room.findByIdAndDelete(id)
  ctx.body = Result.success('ok')
}

export async function adminCloseRoom(ctx) {
  const { id } = ctx.params
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  room.status = ROOM_STATUS.INVALID
  await room.save()
  io?.to('room:' + id).emit('roomClosed')
  io?.to('lobby').emit('refreshLobby')
  ctx.body = Result.success('ok')
}
