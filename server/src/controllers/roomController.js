import { Room, Game, User } from '../models/index.js'
import { Result } from '../utils/response.js'
import { createPassword, isEmpty } from '../utils/helper.js'
import { io, userSockets, playerStatus } from '../state.js'
import { ROOM_STATUS, MODE, GAME_STATUS, ALLOWED_GAME_MODES } from '../config/constants.js'
import * as roomService from '../services/roomService.js'

export async function roomList(ctx) {
  const rooms = await Room.find({ status: { $ne: ROOM_STATUS.INVALID } }).sort({ createdAt: -1 })
  const list = await Promise.all(rooms.map(async (r) => ({
    _id: r._id,
    name: r.name,
    status: r.status,
    mode: r.mode,
    hasPassword: !!r.password,
    owner: r.owner,
    ob: r.ob,
    count: r.count,
    gameId: r.gameId,
    seats: await parseSeatArray(r.seats, r.count)
  })))
  ctx.body = Result.success(list)
}

export async function createRoom(ctx) {
  const { name, password, mode = 'standard_9', remark, nightActionTime, speakActionTime, voteActionTime, chatRateLimit } = ctx.request.body
  const trimmedName = String(name || '').trim()
  if (trimmedName && (trimmedName.length < 2 || trimmedName.length > 16)) {
    ctx.body = Result.fail(-1, '房间名需为 2–16 个字')
    return
  }
  const rawPassword = typeof password === 'string' ? password.trim() : password
  const hasPassword = rawPassword !== undefined && rawPassword !== null && rawPassword !== ''
  if (hasPassword && /^[a-zA-Z0-9]{4,8}$/.test(rawPassword) === false) {
    ctx.body = Result.fail(-1, '密码格式错误，需要4-8位数字或字母')
    return
  }
  const enableChatRateLimit = chatRateLimit === false || chatRateLimit === 'false' ? false : true
  const existingRoom = await Room.findOne({
    status: { $ne: ROOM_STATUS.INVALID },
    $or: [{ owner: ctx.userInfo.username }, { seats: ctx.userInfo.username }]
  })
  if (existingRoom) {
    ctx.body = Result.fail(-1, '你已在其他房间中，请先退出原房间')
    return
  }
  if (!ALLOWED_GAME_MODES.includes(mode)) {
    ctx.body = Result.fail(-1, '不支持的游戏模式')
    return
  }
  const modeConfig = MODE[mode]
  const clampedNightTime = Math.min(30, Math.max(10, Number(nightActionTime) || 15))
  const clampedSpeakTime = Math.min(120, Math.max(30, Number(speakActionTime) || 60))
  const clampedVoteTime = Math.min(30, Math.max(5, Number(voteActionTime) || 30))
  const room = await Room.create({
    name: trimmedName || '狼人杀房间',
    password: hasPassword ? await createPassword(rawPassword) : null,
    mode,
    count: modeConfig.count,
    owner: ctx.userInfo.username,
    remark,
    seats: [ctx.userInfo.username, ...Array(Math.max(0, modeConfig.count - 1)).fill(null)],
    status: ROOM_STATUS.READY,
    nightActionTime: clampedNightTime,
    speakActionTime: clampedSpeakTime,
    voteActionTime: clampedVoteTime,
    chatRateLimit: enableChatRateLimit,
    lastActivityAt: new Date()
  })
  io?.to('lobby').emit('refreshLobby')
  ctx.body = Result.success(room._id)
}

export async function roomInfo(ctx) {
  const { id } = ctx.query
  if (isEmpty(id)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (!roomService.canAccessRoom(room, ctx.userInfo)) {
    ctx.body = Result.fail(-1, '无权访问该房间')
    return
  }
  const seats = await parseSeatArray(room.seats, room.count)
  const onlineStatus = {}
  for (const seat of seats) {
    if (seat.player) {
      onlineStatus[seat.player] = playerStatus.get(seat.player)?.online ?? false
    }
  }
  const result = {
    _id: room._id,
    name: room.name,
    status: room.status,
    mode: room.mode,
    hasPassword: !!room.password,
    owner: room.owner,
    ob: [],
    count: room.count,
    gameId: room.gameId,
    seat: seats,
    nightActionTime: room.nightActionTime ?? 15,
    speakActionTime: room.speakActionTime ?? 60,
    voteActionTime: room.voteActionTime ?? 30,
    onlineStatus
  }
  ctx.body = Result.success(result)
}

export async function verifyRoomPassword(ctx) {
  const { id, password } = ctx.request.body
  if (isEmpty(id)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (!(await roomService.verifyAndUpgradeRoomPassword(room, password))) {
    ctx.body = Result.fail(-1, '房间密码错误')
    return
  }
  ctx.body = Result.success('ok')
}

export async function joinRoom(ctx) {
  const { id, position, password } = ctx.request.body
  if (isEmpty(id)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  const username = ctx.userInfo.username
  const occupiedRoom = await Room.findOne({
    _id: { $ne: id },
    status: { $ne: ROOM_STATUS.INVALID },
    $or: [{ owner: username }, { seats: username }]
  })
  if (occupiedRoom) {
    ctx.body = Result.fail(-1, '你已在其他房间中，请先退出原房间')
    return
  }
  const currentSeatIndex = (room.seats || []).indexOf(username)
  if (currentSeatIndex !== -1 && isEmpty(position)) {
    attachSocketToRoom(userSockets.get(username), id)
    ctx.body = Result.success('ok')
    return
  }
  if (room.status !== ROOM_STATUS.READY) {
    ctx.body = Result.fail(-1, '房间已开始游戏，无法加入')
    return
  }
  // Verify password for non-owners
  if (room.password && room.owner !== username) {
    if (!(await roomService.verifyAndUpgradeRoomPassword(room, password))) {
      ctx.body = Result.fail(-1, '房间密码错误')
      return
    }
  }
  const requestedIndexes = buildCandidateSeatIndexes(room, position)
  if (requestedIndexes.length === 0) {
    ctx.body = Result.fail(-1, isEmpty(position) ? '房间已满' : '无效的座位')
    return
  }

  let updatedRoom = null
  for (const idx of requestedIndexes) {
    updatedRoom = await assignSeat(id, room.count, username, idx)
    if (updatedRoom) break
  }

  if (!updatedRoom) {
    const latestRoom = await Room.findById(id)
    if (!latestRoom) {
      ctx.body = Result.fail(-1, '房间不存在')
      return
    }
    if (latestRoom.status !== ROOM_STATUS.READY) {
      ctx.body = Result.fail(-1, '房间已开始游戏，无法加入')
      return
    }
    ctx.body = Result.fail(-1, isEmpty(position) ? '房间已满' : '该座位已被占用')
    return
  }

  await roomService.touchRoomActivity(id)
  attachSocketToRoom(userSockets.get(username), id)
  io?.to('room:' + id).emit('refreshRoom')
  io?.to('lobby').emit('refreshLobby')
  ctx.body = Result.success('ok')
}

export async function quitRoom(ctx) {
  const { id, username } = ctx.request.body
  if (isEmpty(id)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }

  // Block seat removal during an active game so reconnect still works
  if (room.status === ROOM_STATUS.GOING && room.gameId) {
    const game = await Game.findById(room.gameId)
    if (game && game.status === GAME_STATUS.GOING) {
      ctx.body = Result.fail(-1, '游戏进行中，无法离开座位')
      return
    }
  }

  // Admins and room owners may remove another player from a seat
  const canKickOthers = ctx.userInfo.role === 'admin' || room.owner === ctx.userInfo.username
  const targetUsername = (canKickOthers && username) ? username : ctx.userInfo.username

  // If the owner is leaving (not kicking someone else), delete the room
  if (targetUsername === room.owner && room.owner === ctx.userInfo.username) {
    await Room.findByIdAndDelete(id)
    io?.to('room:' + id).emit('roomDeleted')
    io?.to('lobby').emit('refreshLobby')
    ctx.body = Result.success('ok')
    return
  }
  const updatedRoom = await Room.findByIdAndUpdate(
    id,
    [
      {
        $set: {
          seats: {
            $map: {
              input: { $ifNull: ['$seats', []] },
              as: 'seat',
              in: {
                $cond: [
                  { $eq: ['$$seat', targetUsername] },
                  null,
                  '$$seat'
                ]
              }
            }
          }
        }
      }
    ],
    { new: true }
  )

  if (updatedRoom) await roomService.touchRoomActivity(id)

  const targetSocket = userSockets.get(targetUsername)
  if (targetSocket && !roomService.canAccessRoom(updatedRoom, targetSocket.userInfo || { username: targetUsername })) {
    detachSocketFromRoom(targetSocket, id)
  }

  if (targetUsername !== ctx.userInfo.username) {
    if (targetSocket) targetSocket.emit('kicked')
  }
  io?.to('room:' + id).emit('refreshRoom')
  io?.to('lobby').emit('refreshLobby')
  ctx.body = Result.success('ok')
}

export async function recentRoom(ctx) {
  const username = ctx.userInfo.username
  const room = await Room.findOne({ seats: username, status: ROOM_STATUS.GOING }).sort({ createdAt: -1 })
  if (!room) {
    const readyRoom = await Room.findOne({ seats: username, status: ROOM_STATUS.READY }).sort({ createdAt: -1 })
    if (!readyRoom) {
      ctx.body = Result.success(null)
      return
    }
    ctx.body = Result.success(readyRoom._id)
    return
  }
  ctx.body = Result.success(room._id)
}

export async function deleteRoom(ctx) {
  const { id } = ctx.query
  if (isEmpty(id)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(id)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (room.owner !== ctx.userInfo.username && ctx.userInfo.role !== 'admin') {
    ctx.body = Result.fail(-1, '只能删除自己创建的房间')
    return
  }
  await Room.findByIdAndDelete(id)
  io?.to('room:' + id).emit('roomDeleted')
  io?.to('lobby').emit('refreshLobby')
  ctx.body = Result.success('ok')
}

export const getRoomInfo = roomInfo
export const roomRecent = recentRoom

function buildCandidateSeatIndexes(room, position) {
  if (!isEmpty(position)) {
    const idx = parseInt(position, 10) - 1
    if (Number.isNaN(idx) || idx < 0 || idx >= room.count) return []
    return [idx]
  }

  const seatIndexes = []
  const seats = [...(room.seats || [])]
  while (seats.length < room.count) seats.push(null)
  for (let i = 0; i < room.count; i += 1) {
    if (!seats[i]) seatIndexes.push(i)
  }
  return seatIndexes
}

async function assignSeat(roomId, roomCount, username, idx) {
  const seatPadding = Array(roomCount).fill(null)
  return Room.findOneAndUpdate(
    {
      _id: roomId,
      status: ROOM_STATUS.READY,
      $or: [
        { [`seats.${idx}`]: null },
        { [`seats.${idx}`]: '' },
        { [`seats.${idx}`]: { $exists: false } }
      ]
    },
    [
      {
        $set: {
          seats: {
            $map: {
              input: { $range: [0, roomCount] },
              as: 'seatIndex',
              in: {
                $let: {
                  vars: {
                    currentSeat: {
                      $arrayElemAt: [
                        { $concatArrays: [{ $ifNull: ['$seats', []] }, seatPadding] },
                        '$$seatIndex'
                      ]
                    }
                  },
                  in: {
                    $cond: [
                      { $eq: ['$$seatIndex', idx] },
                      username,
                      {
                        $cond: [
                          { $eq: ['$$currentSeat', username] },
                          null,
                          '$$currentSeat'
                        ]
                      }
                    ]
                  }
                }
              }
            }
          },
          ob: {
            $filter: {
              input: { $ifNull: ['$ob', []] },
              as: 'observer',
              cond: { $ne: ['$$observer', username] }
            }
          }
        }
      }
    ],
    { new: true }
  )
}

function attachSocketToRoom(socket, roomId) {
  if (!socket) return
  const targetRoomId = String(roomId)
  if (socket.currentRoomId && socket.currentRoomId !== targetRoomId) {
    socket.leave(`room:${socket.currentRoomId}`)
  }
  socket.join(`room:${targetRoomId}`)
  socket.currentRoomId = targetRoomId
}

function detachSocketFromRoom(socket, roomId) {
  if (!socket) return
  const targetRoomId = String(roomId)
  socket.leave(`room:${targetRoomId}`)
  if (socket.currentRoomId === targetRoomId) {
    socket.currentRoomId = null
  }
}

async function parseSeatArray(seats = [], count = 9) {
  const arr = [...seats]
  while (arr.length < count) arr.push(null)
  const usernames = arr.filter((s) => s)
  const users = usernames.length > 0
    ? await User.find({ username: { $in: usernames } }, { username: 1, name: 1 })
    : []
  const nameMap = {}
  for (const u of users) nameMap[u.username] = u.name || u.username
  return arr.map((player, i) => ({
    position: i + 1,
    name: player ? (nameMap[player] || player) : `${i + 1}号`,
    player: player || null
  }))
}
