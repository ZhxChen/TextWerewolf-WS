import { Room } from '../models/index.js'
import { ROOM_STATUS } from '../config/constants.js'
import logger from '../utils/logger.js'
import { io } from '../state.js'

const CLEANUP_INTERVAL_MS = 60 * 1000
const READY_INACTIVE_TTL_MS = 30 * 60 * 1000
const INVALID_ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000

// On startup, clear seats in READY rooms — connections are all gone after a crash/restart.
// Uses a conditional update (status filter) to avoid touching rooms that transitioned to GOING
// between the query and the update (race-safe). The same update gives those rooms a fresh
// 30-minute inactivity window instead of closing them immediately after restart.
async function clearStaleSeatsOnStartup() {
  try {
    const rooms = await Room.find({ status: ROOM_STATUS.READY })
    let cleared = 0
    for (const room of rooms) {
      const hasSeats = (room.seats || []).some((s) => s)
      if (hasSeats) {
        const emptySeats = (room.seats || []).map(() => null)
        const result = await Room.updateOne(
          { _id: room._id, status: ROOM_STATUS.READY },
          { seats: emptySeats, wait: [], lastActivityAt: new Date() }
        )
        if (result.modifiedCount > 0) cleared++
      }
    }
    if (cleared > 0) {
      logger.info(`[roomCleanup] Cleared stale seats in ${cleared} READY room(s) on startup`)
      io?.to('lobby').emit('refreshLobby')
    }
  } catch (err) {
    logger.error({ err }, '[roomCleanup] Failed to clear stale seats on startup')
  }
}

async function runCleanup() {
  const now = new Date()
  const inactiveThreshold = new Date(now.getTime() - READY_INACTIVE_TTL_MS)

  try {
    // READY rooms with no seat/leave/start activity for 30 minutes are closed.
    // Old rooms without lastActivityAt fall back to updatedAt/createdAt.
    const inactiveRooms = await Room.find({
      status: ROOM_STATUS.READY,
      $expr: {
        $lt: [
          { $ifNull: ['$lastActivityAt', { $ifNull: ['$updatedAt', '$createdAt'] }] },
          inactiveThreshold
        ]
      }
    }).select('_id')

    let invalidated = 0
    for (const room of inactiveRooms) {
      const result = await Room.updateOne(
        {
          _id: room._id,
          status: ROOM_STATUS.READY,
          $expr: {
            $lt: [
              { $ifNull: ['$lastActivityAt', { $ifNull: ['$updatedAt', '$createdAt'] }] },
              inactiveThreshold
            ]
          }
        },
        { $set: { status: ROOM_STATUS.INVALID } }
      )
      if (result.modifiedCount > 0) {
        invalidated++
        io?.to('room:' + room._id).emit('roomClosed')
        logger.info(`[roomCleanup] Marked inactive room ${room._id} as INVALID`)
      }
    }

    // Keep the existing 7-day hard-delete policy for closed rooms.
    const deleteThreshold = new Date(now.getTime() - INVALID_ROOM_TTL_MS)
    const deleteResult = await Room.deleteMany({
      status: ROOM_STATUS.INVALID,
      updatedAt: { $lt: deleteThreshold }
    })
    if (deleteResult.deletedCount > 0) {
      logger.info(`[roomCleanup] Deleted ${deleteResult.deletedCount} expired INVALID room(s)`)
    }

    if (invalidated > 0 || deleteResult.deletedCount > 0) {
      io?.to('lobby').emit('refreshLobby')
    }
  } catch (err) {
    logger.error({ err }, '[roomCleanup] Cleanup error')
  }
}

export async function startRoomCleanup() {
  // Clear stale seats from pre-restart sessions before scheduling ongoing cleanup.
  await clearStaleSeatsOnStartup()
  // Run once on startup, then every minute so the 30-minute TTL is reasonably tight.
  await runCleanup()
  setInterval(runCleanup, CLEANUP_INTERVAL_MS).unref()
  logger.info('[roomCleanup] Room cleanup scheduler started')
}
