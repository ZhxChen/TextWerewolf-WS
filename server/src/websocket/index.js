import { Server } from 'socket.io'
import { checkToken, isTokenValid } from '../utils/helper.js'
import { userSockets, cache, playerStatus, disconnectTimers } from '../state.js'
import { User, Room, Game, Player, ChatMessage, Action } from '../models/index.js'
import { ROOM_STATUS, GAME_STATUS, GAME_STAGE, PLAYER_STATUS, GAME_ROLE, SKILL_ACTION_KEY, SKILL_STATUS, GAME_WITCH_SAVE_SELF } from '../config/constants.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

import { autoAdvanceSpeaker } from '../services/gameService.js'
import * as roomService from '../services/roomService.js'
import { tryConsume } from '../utils/chatRateLimit.js'

async function restoreRoomSelections(socket, room) {
  const { username } = socket.userInfo || {}
  if (!username || !room?.gameId) return

  const game = await Game.findById(room.gameId)
  if (!game || game.status !== GAME_STATUS.GOING) return

  const player = await Player.findOne({ gameId: String(game._id), username })
  if (!player || player.status === PLAYER_STATUS.DEAD) return

  if (game.stage === GAME_STAGE.WOLF_STAGE && player.role === GAME_ROLE.WOLF) {
    const selections = cache.get(`wolf-selections-${game._id}`)
    if (selections) socket.emit('wolfSelectionsUpdate', selections)
  } else if (game.stage === GAME_STAGE.PREDICTOR_STAGE && player.role === GAME_ROLE.PREDICTOR) {
    const selection = cache.get(`predictor-selection-${game._id}`)
    if (selection !== undefined) socket.emit('predictorSelectionUpdate', selection || null)
  } else if (game.stage === GAME_STAGE.WITCH_STAGE && player.role === GAME_ROLE.WITCH) {
    const selections = cache.get(`witch-selections-${game._id}`)
    if (selections) socket.emit('witchSelectionsUpdate', selections)
  }

  if ([GAME_STAGE.VOTE_STAGE, GAME_STAGE.VOTE_PK_STAGE].includes(game.stage)) {
    const voteActions = await Action.find({ gameId: String(game._id), day: game.day, stage: game.stage, action: SKILL_ACTION_KEY.VOTE })
    if (voteActions.length > 0) {
      const selections = {}
      for (const a of voteActions) selections[a.from] = a.to
      socket.emit('voteSelectionsUpdate', selections)
    }
  }
}

async function findAuthorizedRoom(roomId, userInfo) {
  if (!roomId) return null
  const room = await Room.findOne({ _id: roomId, status: { $ne: ROOM_STATUS.INVALID } })
  if (!roomService.canAccessRoom(room, userInfo)) return null
  return room
}

function joinSocketRoom(socket, roomId) {
  const targetRoomId = String(roomId)
  if (socket.currentRoomId && socket.currentRoomId !== targetRoomId) {
    socket.leave(`room:${socket.currentRoomId}`)
  }
  socket.join(`room:${targetRoomId}`)
  socket.currentRoomId = targetRoomId
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.cors.origin, methods: ['GET', 'POST'] },
    path: '/socket.io'
  })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization
    if (!token) return next(new Error('未认证'))
    try {
      const payload = await checkToken(token)
      if (!payload?.username) return next(new Error('token无效'))
      if (!isTokenValid(token)) return next(new Error('token已失效，请重新登录'))
      const user = await User.findOne({ username: payload.username }).select('username name role status')
      if (!user) return next(new Error('用户不存在'))
      if (user.status === 0) return next(new Error('账户已被禁用'))
      socket.userInfo = { username: user.username, name: user.name, role: user.role, status: user.status }
      next()
    } catch (e) {
      next(new Error('token无效'))
    }
  })

  io.on('connection', (socket) => {
    const { username } = socket.userInfo || {}
    const initialRoomId = typeof socket.handshake.query.roomId === 'string'
      ? socket.handshake.query.roomId
      : null
    const initialLobby = socket.handshake.query.lobby === 'true'
    if (username) {
      userSockets.set(username, socket)

      // Clear any pending disconnect timeout
      const pendingTimer = disconnectTimers.get(username)
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        disconnectTimers.delete(username)
      }

      // Mark player as online and broadcast to room
      playerStatus.set(username, { online: true, disconnectedAt: null })
    }
    logger.info(`Socket connected: ${username}`)

    if (initialLobby) {
      socket.join('lobby')
      logger.info(`${username} joined lobby`)
    }

    if (initialRoomId) {
      ;(async () => {
        try {
          const room = await findAuthorizedRoom(initialRoomId, socket.userInfo)
          if (!room) {
            logger.warn(`${username} attempted unauthorized initial room join: ${initialRoomId}`)
            return
          }

          joinSocketRoom(socket, initialRoomId)
          logger.info(`${username} joined room:${initialRoomId}`)
          io.to('room:' + initialRoomId).emit('playerOnlineStatus', { username, online: true })
          await restoreRoomSelections(socket, room)
        } catch (e) {
          logger.error(`initial room join error for ${username}: ${e.message}`)
        }
      })()
    }

    socket.on('joinRoom', async (roomId) => {
      const targetRoomId = typeof roomId === 'string' ? roomId : ''
      if (!targetRoomId) return

      try {
        const room = await findAuthorizedRoom(targetRoomId, socket.userInfo)
        if (!room) {
          socket.emit('roomError', '无权加入该房间')
          logger.warn(`${username} attempted unauthorized room join: ${targetRoomId}`)
          return
        }

        joinSocketRoom(socket, targetRoomId)
        logger.info(`${username} joined room:${targetRoomId}`)
        await restoreRoomSelections(socket, room)
      } catch (e) {
        logger.error(`joinRoom error for ${username}: ${e.message}`)
      }
    })

    socket.on('leaveRoom', (roomId) => {
      socket.leave(`room:${roomId}`)
      if (socket.currentRoomId === roomId) socket.currentRoomId = null
    })

    socket.on('sendChatMessage', async (data) => {
      const { roomId, gameId, channel, content } = data || {}
      const { username } = socket.userInfo || {}
      if (!roomId || !gameId || !channel || !content?.trim()) return
      if (content.trim().length > 500) {
        socket.emit('chatError', '消息长度不能超过 500 个字符')
        return
      }

      try {
        const game = await Game.findById(gameId)
        if (!game || game.status === GAME_STATUS.FINISHED) return

        const player = await Player.findOne({ roomId, gameId: String(gameId), username })
        if (!player) return

        // Spectator check
        if (!player.position) {
          socket.emit('chatError', '您未在座，无法发言')
          return
        }

        // Dead players cannot speak in public, except during their last-words turn
        if (player.status === PLAYER_STATUS.DEAD && channel === 'public') {
          const isLastWordSpeaker = game.stage === GAME_STAGE.EXILE_FINISH_STAGE
            && game.currentLastWordPosition === player.position
            && (game.lastWordPlayers || []).includes(player.position)
          if (!isLastWordSpeaker) {
            socket.emit('chatError', '您已出局，无法在公开频道发言')
            return
          }
        }

        // Channel permissions
        if (channel === 'wolf') {
          if (player.role !== GAME_ROLE.WOLF || player.status !== PLAYER_STATUS.ALIVE) {
            socket.emit('chatError', '您不是狼人或已出局，无权在狼人频道发言')
            return
          }
        } else if (channel === 'ghost') {
          if (player.status !== PLAYER_STATUS.DEAD) {
            socket.emit('chatError', '只有已出局的玩家才能在亡灵频道发言')
            return
          }
          const lastWordPlayers = game.lastWordPlayers || []
          const currentSpeakerIdx = lastWordPlayers.indexOf(game.currentLastWordPosition)
          const playerIdx = lastWordPlayers.indexOf(player.position)
          const isSpeakingOrWaitingLastWords = game.stage === GAME_STAGE.EXILE_FINISH_STAGE
            && playerIdx !== -1
            && (currentSpeakerIdx === -1 || playerIdx >= currentSpeakerIdx)
          if (isSpeakingOrWaitingLastWords) {
            socket.emit('chatError', '您当前尚未完成遗言，无法在亡灵频道发言')
            return
          }
        } else if (channel === 'public') {
          // Night muting
          if ([GAME_STAGE.PREDICTOR_STAGE, GAME_STAGE.WOLF_STAGE, GAME_STAGE.WITCH_STAGE].includes(game.stage)) {
            socket.emit('chatError', '夜晚闭眼，无法在公开频道发言')
            return
          }

          // Turn-based speech muting
          if (game.stage === GAME_STAGE.SPEAK_STAGE) {
            if (player.position !== game.currentSpeakerPosition) {
              socket.emit('chatError', '当前不是您的发言顺序')
              return
            }
          }

          // Last-words muting: only current last-word speaker may speak
          if (game.stage === GAME_STAGE.EXILE_FINISH_STAGE) {
            const isCurrentLastWordSpeaker = player.position === game.currentLastWordPosition
              && (game.lastWordPlayers || []).includes(player.position)
            if (!isCurrentLastWordSpeaker) {
              socket.emit('chatError', '当前为遗言阶段，请保持安静')
              return
            }
          }
        } else {
          socket.emit('chatError', '未知频道')
          return
        }

        // Chat anti-spam: checked after permissions so wrong-channel attempts do not consume the quota.
        const rateLimitCacheKey = 'room-chat-rate-limit-' + roomId
        let roomChatRateLimit = cache.get(rateLimitCacheKey)
        if (roomChatRateLimit === undefined) {
          const room = await Room.findById(roomId).select('chatRateLimit')
          roomChatRateLimit = room?.chatRateLimit === false ? false : true
          cache.set(rateLimitCacheKey, roomChatRateLimit, 60)
        }
        if (roomChatRateLimit) {
          const { ok } = tryConsume(username, String(roomId))
          if (ok === false) {
            socket.emit('chatError', '发言过于频繁，请稍后再试')
            return
          }
        }

        // Save message to database
        const newMessage = await ChatMessage.create({
          roomId,
          gameId: String(gameId),
          sender: username,
          senderName: socket.userInfo?.name || username,
          senderPosition: player.position,
          senderRole: player.role,
          channel,
          content: content.trim()
        })

        if (channel === 'public') {
          io.to('room:' + roomId).emit('chatMessage', newMessage)
        } else if (channel === 'wolf') {
          // Secure Wolf Broadcast
          const wolves = await Player.find({ gameId: String(gameId), role: GAME_ROLE.WOLF })
          for (const wolf of wolves) {
            const wolfSocket = userSockets.get(wolf.username)
            if (wolfSocket) {
              wolfSocket.emit('chatMessage', newMessage)
            }
          }
          // Also broadcast to admin spectators
          const roomSockets = await io.in('room:' + roomId).fetchSockets()
          for (const rSocket of roomSockets) {
            if (rSocket.userInfo?.role === 'admin') {
              rSocket.emit('chatMessage', newMessage)
            }
          }
        } else if (channel === 'ghost') {
          // Ghost channel: broadcast only to dead players (excluding those still speaking/waiting last words)
          const deadPlayers = await Player.find({ gameId: String(gameId), status: PLAYER_STATUS.DEAD })
          const lastWordPlayers = game.lastWordPlayers || []
          const currentSpeakerIdx = lastWordPlayers.indexOf(game.currentLastWordPosition)

          for (const dp of deadPlayers) {
            const dpIdx = lastWordPlayers.indexOf(dp.position)
            const dpIsSpeakingOrWaitingLastWords = game.stage === GAME_STAGE.EXILE_FINISH_STAGE
              && dpIdx !== -1
              && (currentSpeakerIdx === -1 || dpIdx >= currentSpeakerIdx)

            if (!dpIsSpeakingOrWaitingLastWords) {
              const dpSocket = userSockets.get(dp.username)
              if (dpSocket) {
                dpSocket.emit('chatMessage', newMessage)
              }
            }
          }
          // Also broadcast to admin spectators
          const roomSockets = await io.in('room:' + roomId).fetchSockets()
          for (const rSocket of roomSockets) {
            if (rSocket.userInfo?.role === 'admin') {
              rSocket.emit('chatMessage', newMessage)
            }
          }
        }
      } catch (e) {
        logger.error(`sendChatMessage error: ${e.message}`)
      }
    })

    socket.on('wolfSelectTarget', async (data) => {
      const { roomId, gameId, targetUsername } = data || {}
      const { username } = socket.userInfo || {}
      if (!roomId || !gameId) return

      try {
        const game = await Game.findById(gameId)
        if (!game || game.status !== GAME_STATUS.GOING || game.stage !== GAME_STAGE.WOLF_STAGE) return

        const player = await Player.findOne({ gameId: String(gameId), username })
        if (!player || player.role !== GAME_ROLE.WOLF || player.status === PLAYER_STATUS.DEAD) return

        const target = targetUsername
          ? await Player.findOne({ gameId: String(gameId), username: targetUsername, status: PLAYER_STATUS.ALIVE })
          : null
        if (targetUsername && (!target || targetUsername === username)) return

        const cacheKey = `wolf-selections-${gameId}`
        const selections = cache.get(cacheKey) || {}
        if (targetUsername) {
          selections[username] = targetUsername
        } else {
          delete selections[username]
        }
        cache.set(cacheKey, selections)

        const wolves = await Player.find({ gameId: String(gameId), role: GAME_ROLE.WOLF, status: PLAYER_STATUS.ALIVE })
        for (const wolf of wolves) {
          const wolfSocket = userSockets.get(wolf.username)
          if (wolfSocket) {
            wolfSocket.emit('wolfSelectionsUpdate', selections)
          }
        }
      } catch (e) {
        logger.error(`wolfSelectTarget error: ${e.message}`)
      }
    })

    socket.on('predictorSelectTarget', async (data) => {
      const { roomId, gameId, targetUsername } = data || {}
      const { username } = socket.userInfo || {}
      if (!roomId || !gameId) return

      try {
        const game = await Game.findById(gameId)
        if (!game || game.status !== GAME_STATUS.GOING || game.stage !== GAME_STAGE.PREDICTOR_STAGE) return

        const player = await Player.findOne({ gameId: String(gameId), username })
        if (!player || player.role !== GAME_ROLE.PREDICTOR || player.status === PLAYER_STATUS.DEAD) return

        const target = targetUsername
          ? await Player.findOne({ gameId: String(gameId), username: targetUsername, status: PLAYER_STATUS.ALIVE })
          : null
        if (targetUsername && (!target || targetUsername === username)) return

        const cacheKey = `predictor-selection-${gameId}`
        if (targetUsername) {
          cache.set(cacheKey, targetUsername)
        } else {
          cache.del(cacheKey)
        }

        socket.emit('predictorSelectionUpdate', targetUsername || null)
      } catch (e) {
        logger.error(`predictorSelectTarget error: ${e.message}`)
      }
    })

    socket.on('witchSelectTarget', async (data) => {
      const { roomId, gameId, antidote, poisonTargetUsername } = data || {}
      const { username } = socket.userInfo || {}
      if (!roomId || !gameId) return

      try {
        const game = await Game.findById(gameId)
        if (!game || game.status !== GAME_STATUS.GOING || game.stage !== GAME_STAGE.WITCH_STAGE) return

        const player = await Player.findOne({ gameId: String(gameId), username })
        if (!player || player.role !== GAME_ROLE.WITCH || player.status === PLAYER_STATUS.DEAD) return

        let finalAntidote = !!antidote
        let finalPoisonTargetUsername = poisonTargetUsername || null

        if (finalAntidote) {
          finalPoisonTargetUsername = null
          const antidoteSkill = (player.skill || []).find((s) => s.key === SKILL_ACTION_KEY.ANTIDOTE)
          if (!antidoteSkill || antidoteSkill.status !== SKILL_STATUS.AVAILABLE) {
            finalAntidote = false
          } else {
            const killAction = await Action.findOne({ gameId: String(gameId), roomId, day: game.day, stage: GAME_STAGE.WOLF_STAGE, action: SKILL_ACTION_KEY.KILL })
            if (!killAction) {
              finalAntidote = false
            } else if (killAction.to === username) {
              if (game.witchSaveSelf === GAME_WITCH_SAVE_SELF.NO_SAVE_SELF) {
                finalAntidote = false
              } else if (game.witchSaveSelf === GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT && game.day > 1) {
                finalAntidote = false
              }
            }
          }
        } else if (finalPoisonTargetUsername) {
          finalAntidote = false
          const poisonSkill = (player.skill || []).find((s) => s.key === SKILL_ACTION_KEY.POISON)
          const target = await Player.findOne({ gameId: String(gameId), username: finalPoisonTargetUsername, status: PLAYER_STATUS.ALIVE })
          if (!poisonSkill || poisonSkill.status !== SKILL_STATUS.AVAILABLE || !target) {
            finalPoisonTargetUsername = null
          }
        }

        const cacheKey = `witch-selections-${gameId}`
        const selections = {
          antidote: finalAntidote,
          poisonTargetUsername: finalPoisonTargetUsername
        }
        cache.set(cacheKey, selections)

        socket.emit('witchSelectionsUpdate', selections)
      } catch (e) {
        logger.error(`witchSelectTarget error: ${e.message}`)
      }
    })

    socket.on('voteSelectTarget', async (data) => {
      const { roomId, gameId, targetUsername } = data || {}
      const { username } = socket.userInfo || {}
      if (!roomId || !gameId) return

      try {
        const game = await Game.findById(gameId)
        if (!game || game.status !== GAME_STATUS.GOING) return
        if (game.stage !== GAME_STAGE.VOTE_STAGE && game.stage !== GAME_STAGE.VOTE_PK_STAGE) return

        const player = await Player.findOne({ gameId: String(gameId), username })
        if (!player || player.status === PLAYER_STATUS.DEAD) return

        // In PK stage, PK candidates cannot vote (they are the ones being voted on)
        const isPkStage = game.stage === GAME_STAGE.VOTE_PK_STAGE
        if (isPkStage && (game.pkCandidates || []).includes(username)) return

        if (targetUsername) {
          // In PK stage, only PK candidates can be targeted
          if (isPkStage && !(game.pkCandidates || []).includes(targetUsername)) return
          const target = await Player.findOne({ gameId: String(gameId), username: targetUsername, status: PLAYER_STATUS.ALIVE })
          if (!target || targetUsername === username) return

          // Atomic upsert — overwrites any existing vote from this player
          await Action.findOneAndUpdate(
            { gameId: String(gameId), day: game.day, stage: game.stage, from: username, action: SKILL_ACTION_KEY.VOTE },
            { $set: { roomId, to: targetUsername } },
            { upsert: true }
          )
        } else {
          // null targetUsername = unvote
          await Action.deleteOne({ gameId: String(gameId), day: game.day, stage: game.stage, from: username, action: SKILL_ACTION_KEY.VOTE })
        }

        // Build current selections from DB and broadcast to all alive players
        const voteActions = await Action.find({ gameId: String(gameId), day: game.day, stage: game.stage, action: SKILL_ACTION_KEY.VOTE })
        const selections = {}
        for (const a of voteActions) {
          selections[a.from] = a.to
        }

        const alivePlayers = await Player.find({ gameId: String(gameId), status: PLAYER_STATUS.ALIVE })
        for (const p of alivePlayers) {
          const pSocket = userSockets.get(p.username)
          if (pSocket) {
            pSocket.emit('voteSelectionsUpdate', selections)
          }
        }
      } catch (e) {
        logger.error(`voteSelectTarget error: ${e.message}`)
      }
    })

    socket.on('disconnect', async () => {
      if (username && userSockets.get(username) === socket) {
        userSockets.delete(username)
      }
      const roomId = socket.currentRoomId

      // Mark player offline and broadcast
      if (username) {
        const now = new Date()
        playerStatus.set(username, { online: false, disconnectedAt: now })
        if (roomId) {
          io.to('room:' + roomId).emit('playerOnlineStatus', { username, online: false })
        }
      }

      if (roomId) {
        try {
          const room = await Room.findOne({ _id: roomId, status: { $ne: ROOM_STATUS.INVALID } })
          if (room && room.seats.includes(username)) {
            // During an active game keep the seat so the player can reconnect
            if (room.status === ROOM_STATUS.GOING && room.gameId) {
              const game = await Game.findById(room.gameId)
              if (game && game.status === GAME_STATUS.GOING) {
                io.to('room:' + roomId).emit('refreshRoom')

                // Start disconnect timeout: auto-forfeit if player doesn't reconnect
                const DISCONNECT_TIMEOUT = 120_000
                const timer = setTimeout(async () => {
                  disconnectTimers.delete(username)
                  if (playerStatus.get(username)?.online) return
                  try {
                    const activeRoom = await Room.findById(roomId)
                    if (!activeRoom?.gameId) return
                    const activeGame = await Game.findById(activeRoom.gameId)
                    if (!activeGame || activeGame.status !== GAME_STATUS.GOING) return
                    // Auto-advance speak stage if disconnected player is the current speaker
                    if (activeGame.stage === GAME_STAGE.SPEAK_STAGE) {
                      const p = await Player.findOne({ gameId: String(activeGame._id), username })
                      if (p && Number(p.position) === Number(activeGame.currentSpeakerPosition)) {
                        logger.info(`[disconnect-timeout] auto-advancing speaker for ${username} in game ${activeGame._id}`)
                        await autoAdvanceSpeaker(String(activeGame._id))
                      }
                    }
                  } catch (e) {
                    logger.error(`disconnect timeout handler error for ${username}: ${e.message}`)
                  }
                }, DISCONNECT_TIMEOUT)
                disconnectTimers.set(username, timer)

                return
              }
            }
            // In READY rooms, keep the player seated so refresh/reconnect does not
            // unexpectedly revoke room access after a game ends.
          }
        } catch (e) {
          logger.error(`disconnect seat cleanup error for ${username}: ${e.message}`)
        }
      }
      logger.info(`Socket disconnected: ${username}`)
    })
  })

  return io
}
