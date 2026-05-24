import Room from '../models/Room.js'
import User from '../models/User.js'
import { ROOM_STATUS } from '../config/constants.js'
import { checkPassword, createPassword, isEmpty } from '../utils/helper.js'
import { disconnectTimers, playerStatus, userSockets } from '../state.js'

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/

export async function isPlayerInSeat(roomId, username) {
  if (!roomId || !username) return false
  const room = await Room.findById(roomId)
  if (!room) return false
  return (room.seats || []).includes(username)
}

export async function getRoomSeatPlayer(roomId, currentUsername) {
  const room = await Room.findById(roomId)
  if (!room) throw new Error('房间不存在')
  const count = room.count
  const list = []
  for (let i = 0; i < count; i += 1) {
    const username = room.seats[i]
    if (!username) {
      list.push({ player: null, position: i + 1, name: `${i + 1}号` })
      continue
    }
    const userInfo = await User.findOne({ username }, { password: 0 })
    list.push({
      player: userInfo ? {
        name: userInfo.name,
        _id: userInfo._id,
        username: userInfo.username,
        isSelf: currentUsername === userInfo.username
      } : null,
      position: i + 1,
      name: `${i + 1}号`
    })
  }
  const isFull = list.every((item) => item.player !== null)
  return { content: list, isFull, statusString: isFull ? '已坐满' : '未坐满' }
}

export async function clearSeat(roomId, username) {
  const room = await Room.findById(roomId)
  if (!room) throw new Error('房间不存在')
  const idx = (room.seats || []).indexOf(username)
  if (idx !== -1) {
    const newSeats = [...room.seats]
    newSeats[idx] = null
    await Room.findByIdAndUpdate(roomId, { seats: newSeats })
  }
}

export async function getWaitPlayerList(roomInstance) {
  const list = []
  for (const un of roomInstance.wait || []) {
    const user = await User.findOne({ username: un })
    if (user) list.push({ username: user.username, name: user.name })
  }
  return list
}

export async function getRoomByUsername(username) {
  return Room.findOne({
    $or: [
      { seats: username },
      { wait: username }
    ]
  }).sort({ createdAt: -1 })
}

export function canAccessRoom(roomInstance, userInfo = {}) {
  const username = userInfo?.username
  if (!roomInstance || !username) return false
  if (userInfo.role === 'admin') return true
  return roomInstance.owner === username
    || (roomInstance.seats || []).includes(username)
}

export async function verifyAndUpgradeRoomPassword(roomInstance, password) {
  if (!roomInstance?.password) return true
  if (isEmpty(password)) return false

  const storedPassword = String(roomInstance.password)
  const rawPassword = String(password)

  if (BCRYPT_HASH_PATTERN.test(storedPassword)) {
    return checkPassword(rawPassword, storedPassword)
  }

  if (storedPassword !== rawPassword) return false

  roomInstance.password = await createPassword(rawPassword)
  await roomInstance.save()
  return true
}

export async function findObserverRoomByPassword(password) {
  if (isEmpty(password)) return null

  const rooms = await Room.find({
    status: ROOM_STATUS.GOING,
    gameId: { $exists: true, $ne: null }
  }).sort({ createdAt: -1 })

  let matchedRoom = null
  for (const room of rooms) {
    if (await verifyAndUpgradeRoomPassword(room, password) && !matchedRoom) {
      matchedRoom = room
    }
  }

  return matchedRoom
}

export async function clearOfflineSeats(roomId) {
  const room = await Room.findById(roomId)
  if (!room) return { room: null, clearedUsernames: [] }

  const seats = [...(room.seats || [])]
  const clearedUsernames = []
  const nextSeats = seats.map((seat) => {
    if (!seat) return null
    const isOnline = playerStatus.get(seat)?.online === true || userSockets.has(seat)
    if (isOnline) return seat
    clearedUsernames.push(seat)
    return null
  })

  if (clearedUsernames.length === 0) {
    return { room, clearedUsernames }
  }

  const updatedRoom = await Room.findByIdAndUpdate(roomId, { seats: nextSeats }, { new: true })
  for (const username of clearedUsernames) {
    const timer = disconnectTimers.get(username)
    if (timer) {
      clearTimeout(timer)
      disconnectTimers.delete(username)
    }
  }

  return { room: updatedRoom, clearedUsernames }
}
