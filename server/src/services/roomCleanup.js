import { Room } from '../models/index.js'
import { ROOM_STATUS } from '../config/constants.js'
import logger from '../utils/logger.js'

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000       // 30 minutes
const EMPTY_ROOM_TTL_MS = 2 * 60 * 60 * 1000     // 2 hours  — empty ready room
const STALE_ROOM_TTL_MS = 24 * 60 * 60 * 1000    // 24 hours — any ready room
const INVALID_ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days — hard delete invalid rooms

// On startup, clear seats in READY rooms — connections are all gone after a crash/restart.
// Uses a conditional update (status filter) to avoid touching rooms that transitioned to GOING
// between the query and the update (race-safe).
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
          { seats: emptySeats, wait: [] }
        )
        if (result.modifiedCount > 0) cleared++
      }
    }
    if (cleared > 0) {
      logger.info(`[roomCleanup] Cleared stale seats in ${cleared} READY room(s) on startup`)
    }
  } catch (err) {
    logger.error({ err }, '[roomCleanup] Failed to clear stale seats on startup')
  }
}

async function runCleanup() {
  const now = new Date()

  try {
    // 1. Empty ready rooms idle > 2h → mark INVALID
    const emptyThreshold = new Date(now - EMPTY_ROOM_TTL_MS)
    const emptyRooms = await Room.find({
      status: ROOM_STATUS.READY,
      updatedAt: { $lt: emptyThreshold }
    })
    for (const room of emptyRooms) {
      const occupied = (room.seats || []).some((s) => s && s !== '')
      if (!occupied) {
        room.status = ROOM_STATUS.INVALID
        await room.save()
        logger.info(`[roomCleanup] Marked empty room ${room._id} as INVALID`)
      }
    }

    // 2. Any ready room idle > 24h → mark INVALID
    const staleThreshold = new Date(now - STALE_ROOM_TTL_MS)
    const staleResult = await Room.updateMany(
      { status: ROOM_STATUS.READY, updatedAt: { $lt: staleThreshold } },
      { status: ROOM_STATUS.INVALID }
    )
    if (staleResult.modifiedCount > 0) {
      logger.info(`[roomCleanup] Marked ${staleResult.modifiedCount} stale room(s) as INVALID`)
    }

    // 3. Hard-delete INVALID rooms older than 7 days
    const deleteThreshold = new Date(now - INVALID_ROOM_TTL_MS)
    const deleteResult = await Room.deleteMany({
      status: ROOM_STATUS.INVALID,
      updatedAt: { $lt: deleteThreshold }
    })
    if (deleteResult.deletedCount > 0) {
      logger.info(`[roomCleanup] Deleted ${deleteResult.deletedCount} expired INVALID room(s)`)
    }
  } catch (err) {
    logger.error({ err }, '[roomCleanup] Cleanup error')
  }
}

export function startRoomCleanup() {
  // Clear stale seats from pre-restart sessions before scheduling ongoing cleanup
  clearStaleSeatsOnStartup()
  // Run once on startup, then on interval
  runCleanup()
  setInterval(runCleanup, CLEANUP_INTERVAL_MS)
  logger.info('[roomCleanup] Room cleanup scheduler started')
}
