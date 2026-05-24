import { Game, Player, Action, Vision, Room } from '../models/index.js'
import { GAME_STATUS, GAME_STAGE, GAME_ROLE, PLAYER_STATUS, PLAYER_ROLE_MAP, SKILL_MAP, VISION_STATUS, GAME_CAMP, GAME_WIN_CONDITION, GAME_TICKET_FLAT, MODE, BROADCAST_MAP, STAGE_MAP, SKILL_ACTION_KEY, SKILL_STATUS, GAME_OUT_REASON } from '../config/constants.js'
import * as recordService from './recordService.js'
import * as stageService from './stageService.js'
import * as playerService from './playerService.js'
import * as roomService from './roomService.js'
import { getRandomNumberArray, getVisionKey, getRoleName, getCampByRole } from '../utils/helper.js'
import { io, timers, cache, advancingGames } from '../state.js'
import logger from '../utils/logger.js'

const advancingSpeakers = new Set()
const advancingLastWord = new Set()

export async function createNewGame(roomId, config = {}) {
  const room = await Room.findById(roomId)
  const modeConfig = MODE[room.mode]
  const playerCount = modeConfig.count

  const roleAssignments = getRandomNumberArray(modeConfig.ROLE_MAP)

  const gameData = {
    roomId: String(roomId),
    owner: room.owner,
    status: GAME_STATUS.GOING,
    stage: GAME_STAGE.READY,
    stageStack: buildStageStack(modeConfig),
    day: 1,
    seats: [...room.seats],
    mode: room.mode,
    playerCount,
    witchSaveSelf: config.witchSaveSelf ?? modeConfig.CONFIG_DEFAULT.witchSaveSelf,
    winCondition: config.winCondition ?? modeConfig.CONFIG_DEFAULT.winCondition,
    flatTicket: config.flatTicket ?? modeConfig.CONFIG_DEFAULT.flatTicket,
    predictorActionTime: normalizeActionTime(config.predictorActionTime, modeConfig.CONFIG_DEFAULT.predictorActionTime, 10, 30),
    wolfActionTime: normalizeActionTime(config.wolfActionTime, modeConfig.CONFIG_DEFAULT.wolfActionTime, 10, 30),
    witchActionTime: normalizeActionTime(config.witchActionTime, modeConfig.CONFIG_DEFAULT.witchActionTime, 10, 30),
    speakActionTime: normalizeActionTime(config.speakActionTime, 60, 30, 120),
    voteActionTime: normalizeActionTime(config.voteActionTime, 30, 5, 30),
  }
  const game = await Game.create(gameData)

  const seatUsernames = room.seats.filter((s) => s)
  for (let i = 0; i < seatUsernames.length; i += 1) {
    const username = seatUsernames[i]
    const seatPosition = room.seats.indexOf(username) + 1
    const assigned = roleAssignments.find((r) => r.number === i + 1) || roleAssignments[i]
    const role = assigned ? assigned.role : GAME_ROLE.VILLAGER
    const roleInfo = PLAYER_ROLE_MAP[role]

    await Player.create({
      roomId: String(roomId),
      gameId: String(game._id),
      username,
      name: username,
      role,
      roleName: roleInfo.name,
      camp: roleInfo.camp,
      campName: roleInfo.campName,
      status: PLAYER_STATUS.ALIVE,
      position: seatPosition,
      skill: JSON.parse(JSON.stringify(SKILL_MAP[role] || []))
    })
  }

  const players = await Player.find({ gameId: String(game._id) })
  for (const from of players) {
    for (const to of players) {
      const visionStatus = getVisionKey(from, to)
      await Vision.create({
        roomId: String(roomId),
        gameId: String(game._id),
        from: from.username,
        to: to.username,
        status: visionStatus
      })
    }
  }

  await recordService.gameStartRecord(game)
  await recordService.nightBeginRecord(game, game.day, GAME_STAGE.READY)
  return game
}

export async function getPlayerInfoInGame(gameId, currentUsername, isOb = false) {
  const game = await Game.findById(gameId)
  const players = await Player.find({ gameId: String(gameId) }).sort({ position: 1 })
  const revealAll = game?.status === GAME_STATUS.FINISHED
  const currentPlayer = players.find((player) => player.username === currentUsername) || null
  const checkedTargets = new Set()

  if (currentPlayer?.role === GAME_ROLE.PREDICTOR) {
    const checkActions = await Action.find({
      gameId: String(gameId),
      from: currentUsername,
      action: SKILL_ACTION_KEY.CHECK
    }, { to: 1 })

    checkActions.forEach((action) => {
      if (action.to) checkedTargets.add(action.to)
    })
  }

  return players.map((p) => {
    const isSelf = p.username === currentUsername
    const visionStatus = getVisionStatus(currentPlayer, p, checkedTargets)
    let camp = null
    let campName = null

    if (revealAll) {
      camp = p.camp
      campName = p.campName
    } else if (visionStatus >= VISION_STATUS.KNOWN_CAMP) {
      camp = p.camp
      campName = p.campName
    }

    return {
      username: p.username,
      name: p.name,
      position: p.position,
      role: revealAll ? p.role : null,
      roleName: revealAll ? p.roleName : null,
      camp,
      campName,
      status: p.status,
      outReason: p.outReason,
      isSelf,
      isTarget: isTarget(p, currentUsername, visionStatus, isOb)
    }
  })
}

function isTarget(player, currentUsername, visionStatus, isOb) {
  if (isOb) return false
  if (player.username === currentUsername) return false
  if (player.status === PLAYER_STATUS.DEAD) return false
  return true
}

export async function getSkillStatusInGame(gameId, currentUsername) {
  const game = await Game.findById(gameId)
  const player = await Player.findOne({ gameId: String(gameId), username: currentUsername })
  if (!game || !player) return []

  const hasUsedWitchSkill = player.role === GAME_ROLE.WITCH && game.stage === GAME_STAGE.WITCH_STAGE
    ? await Action.exists({
        gameId: String(gameId),
        roomId: game.roomId,
        day: game.day,
        stage: GAME_STAGE.WITCH_STAGE,
        from: currentUsername,
        action: { $in: [SKILL_ACTION_KEY.ANTIDOTE, SKILL_ACTION_KEY.POISON] }
      })
    : false

  const visibleSkills = (player.skill || [])
    .filter((skill) => skill.key !== 'boom')
    .filter((skill) => shouldExposeSkillForStage(player, skill, game, !!hasUsedWitchSkill))
  const isPkCandidate = game.stage === GAME_STAGE.VOTE_PK_STAGE && game.pkCandidates?.includes(currentUsername)
  if (player.status === PLAYER_STATUS.ALIVE && !isPkCandidate && (game.stage === GAME_STAGE.VOTE_STAGE || game.stage === GAME_STAGE.VOTE_PK_STAGE)) {
    visibleSkills.push({ name: '投票', key: SKILL_ACTION_KEY.VOTE, status: SKILL_STATUS.AVAILABLE })
  }
  return visibleSkills
}

export async function getBroadcastInfo(gameId) {
  const game = await Game.findById(gameId)
  const stage = game.stage
  const stageKey = STAGE_MAP[stage]?.key
  return BROADCAST_MAP[stageKey] || []
}

export async function getActionStatusInGame(gameId, currentUsername) {
  const game = await Game.findById(gameId)
  const actions = await Action.find({ gameId: String(gameId), day: game.day, from: currentUsername })
  return actions
}

export async function getWitchStageInfo(gameId, currentUsername) {
  const game = await Game.findById(gameId)
  if (!game || game.stage !== GAME_STAGE.WITCH_STAGE) return null

  const witch = await Player.findOne({ gameId: String(gameId), username: currentUsername })
  if (!witch || witch.role !== GAME_ROLE.WITCH || witch.status !== PLAYER_STATUS.ALIVE) return null

  const antidoteSkill = (witch.skill || []).find((skill) => skill.key === SKILL_ACTION_KEY.ANTIDOTE)
  if (!antidoteSkill || antidoteSkill.status !== SKILL_STATUS.AVAILABLE) return null

  const killAction = await Action.findOne({
    gameId: String(gameId),
    roomId: game.roomId,
    day: game.day,
    stage: GAME_STAGE.WOLF_STAGE,
    action: SKILL_ACTION_KEY.KILL
  })
  if (!killAction) return null

  const targetPlayer = await Player.findOne({
    gameId: String(gameId),
    roomId: game.roomId,
    username: killAction.to
  })
  if (!targetPlayer) return null

  return {
    antidoteTarget: {
      username: targetPlayer.username,
      name: targetPlayer.name,
      position: targetPlayer.position
    }
  }
}

export async function settleGameOver(gameId) {
  const game = await Game.findById(gameId)
  if (game.status !== GAME_STATUS.GOING) return false

  const players = await Player.find({ gameId: String(gameId), status: PLAYER_STATUS.ALIVE })
  const wolves = players.filter((p) => p.camp === GAME_CAMP.WOLF)
  const good = players.filter((p) => p.camp !== GAME_CAMP.WOLF)

  // Simultaneous Annihilation: If both sides are wiped out, the Wolves win
  if (wolves.length === 0 && good.length === 0) {
    await setGameWin(gameId, GAME_CAMP.WOLF)
    return true
  }

  if (wolves.length === 0) {
    await setGameWin(gameId, GAME_CAMP.CLERIC_AND_VILLAGER)
    return true
  }

  if (game.winCondition === GAME_WIN_CONDITION.KILL_ALL) {
    if (good.length === 0) {
      await setGameWin(gameId, GAME_CAMP.WOLF)
      return true
    }
  } else {
    const clerics = players.filter((p) => p.camp !== GAME_CAMP.WOLF && p.role !== GAME_ROLE.VILLAGER)
    const villagers = players.filter((p) => p.role === GAME_ROLE.VILLAGER)
    if (clerics.length === 0 || villagers.length === 0) {
      await setGameWin(gameId, GAME_CAMP.WOLF)
      return true
    }
  }

  return false
}

export async function setGameWin(gameId, camp) {
  const game = await Game.findById(gameId)
  const campNames = { 0: '狼人阵营', 1: '好人阵营', 2: '第三方阵营' }
  await Game.findByIdAndUpdate(gameId, {
    status: GAME_STATUS.FINISHED,
    winner: camp,
    winnerString: campNames[camp] || '未知'
  })
  const updatedGame = await Game.findById(gameId)
  await recordService.gameWinRecord(updatedGame, camp)
  io?.to('room:' + game.roomId).emit('gameOver')
}

export async function moveToNextStage(gameId) {
  const gameIdStr = String(gameId)
  if (advancingGames.has(gameIdStr)) return
  advancingGames.add(gameIdStr)

  let scheduleImmediateAdvance = false

  try {
    const game = await Game.findById(gameId)
    if (!game || game.status !== GAME_STATUS.GOING) return

    // When leaving AFTER_NIGHT → EXILE_FINISH (injected for night deaths),
    // skip voiding hunter shoot so they can still shoot during last words
    const nextStageOnStack = game.stageStack[game.stageStack.length - 1]
    const skipVoidShoot = game.stage === GAME_STAGE.AFTER_NIGHT
      && nextStageOnStack === GAME_STAGE.EXILE_FINISH_STAGE

    // Void unused shoot skills and check bypassed game-over conditions when leaving death stages
    if (!skipVoidShoot && (game.stage === GAME_STAGE.AFTER_NIGHT || game.stage === GAME_STAGE.EXILE_FINISH_STAGE)) {
      const deadHunters = await Player.find({ gameId: String(gameId), role: GAME_ROLE.HUNTER, status: PLAYER_STATUS.DEAD })
      for (const hunter of deadHunters) {
        await playerService.modifyPlayerSkill(hunter, SKILL_ACTION_KEY.SHOOT, SKILL_STATUS.UNAVAILABLE)
      }

      const isOver = await settleGameOver(gameId)
      if (isOver) {
        io?.to('room:' + game.roomId).emit('refreshGame')
        return
      }
    }

    const stack = [...game.stageStack]

    const settlement = await handleStageSettlement(game, stack)

    // Re-check: game may have ended during settlement (e.g., vote exile triggered game over)
    const gameAfterSettlement = await Game.findById(gameId)
    if (gameAfterSettlement.status === GAME_STATUS.FINISHED) {
      io?.to('room:' + gameAfterSettlement.roomId).emit('refreshGame')
      return
    }

    if (settlement?.overrideNextStage) {
      const updateData = { stage: settlement.overrideNextStage }
      if (settlement.updateStack) updateData.stageStack = settlement.updateStack
      await Game.findByIdAndUpdate(gameId, updateData)
    } else {
      const nextStage = stack.pop()
      if (nextStage === undefined) {
        await moveToNightReady(gameId)
      } else {
        await Game.findByIdAndUpdate(gameId, { stage: nextStage, stageStack: stack })
      }
    }

    const updatedGame = await Game.findById(gameId)

    if (updatedGame.stage === GAME_STAGE.SPEAK_STAGE) {
      await stageService.preSpeakStage(gameId)
    }
    if (updatedGame.stage === GAME_STAGE.AFTER_NIGHT) {
      await recordService.dayBeginRecord(updatedGame)
      const deadPositions = await stageService.settleStage(gameId)

      if (updatedGame.day === 1 && deadPositions && deadPositions.length > 0) {
        // First night: inject last-words stage for all dead players
        const updatedStack = [...updatedGame.stageStack, GAME_STAGE.EXILE_FINISH_STAGE]
        await Game.findByIdAndUpdate(gameId, {
          stageStack: updatedStack,
          lastWordPlayers: shuffleArray(deadPositions),
          lastWordContext: 'night'
        })
        // Defer settleGameOver until after last words
      } else {
        const pendingShoot = await checkPendingHunterShoot(gameId)
        if (!pendingShoot) {
          const isOver = await settleGameOver(gameId)
          if (isOver) {
            io?.to('room:' + updatedGame.roomId).emit('refreshGame')
            return
          }
        }
      }

      io?.to('room:' + updatedGame.roomId).emit('stageChange')
      await startStageTimer(gameId, updatedGame)
      return
    }
    if (updatedGame.stage === GAME_STAGE.EXILE_FINISH_STAGE) {
      const isOver = await settleGameOver(gameId)
      if (isOver) {
        io?.to('room:' + updatedGame.roomId).emit('refreshGame')
        return
      }
      const latestGame = await Game.findById(gameId)
      if (!latestGame.lastWordPlayers || latestGame.lastWordPlayers.length === 0) {
        const hasPendingShoot = await checkPendingHunterShoot(gameId)
        if (!hasPendingShoot) {
          scheduleImmediateAdvance = true
          return
        }
        // Has hunter shoot pending: keep timer running for shoot window
      } else {
        await Game.findByIdAndUpdate(gameId, { currentLastWordPosition: latestGame.lastWordPlayers[0] })
      }
    }
    if (updatedGame.stage === GAME_STAGE.READY) {
      io?.to('room:' + updatedGame.roomId).emit('stageChange')
      await startStageTimer(gameId, updatedGame)
      return
    }

    io?.to('room:' + updatedGame.roomId).emit('stageChange')
    await startStageTimer(gameId, updatedGame)
  } finally {
    advancingGames.delete(gameIdStr)
  }

  if (scheduleImmediateAdvance) {
    await moveToNextStage(gameId)
  }
}

async function handleStageSettlement(game, stack) {
  switch (game.stage) {
    case GAME_STAGE.PREDICTOR_STAGE:
      await stageService.predictorStage(game._id)
      break
    case GAME_STAGE.WOLF_STAGE:
      await stageService.wolfStage(game._id)
      break
    case GAME_STAGE.WITCH_STAGE:
      await stageService.witchStage(game._id)
      break
    case GAME_STAGE.VOTE_STAGE: {
      const result = await stageService.voteStage(game._id)
      if (result?.exiled) {
        await Game.findByIdAndUpdate(game._id, {
          lastWordPlayers: [result.exiled.position],
          lastWordContext: 'day'
        })
        // settleGameOver deferred to when leaving EXILE_FINISH_STAGE
      } else if (result?.tie && game.flatTicket === GAME_TICKET_FLAT.NEED_PK) {
        await Game.findByIdAndUpdate(game._id, { pkCandidates: result.candidates })
        stack.push(GAME_STAGE.VOTE_PK_STAGE)
        return { overrideNextStage: GAME_STAGE.SPEAK_STAGE, updateStack: stack }
      } else {
        if (stack[stack.length - 1] === GAME_STAGE.EXILE_FINISH_STAGE) {
          stack.pop()
        }
        await Game.findByIdAndUpdate(game._id, { lastWordPlayers: [], lastWordContext: '', currentLastWordPosition: -1 })
      }
      break
    }
    case GAME_STAGE.VOTE_PK_STAGE: {
      const result = await stageService.voteStage(game._id)
      if (result?.exiled) {
        await Game.findByIdAndUpdate(game._id, {
          lastWordPlayers: [result.exiled.position],
          lastWordContext: 'day'
        })
        // settleGameOver deferred to when leaving EXILE_FINISH_STAGE
      } else {
        // Tie in PK: nobody out — clear pkCandidates and proceed normally
        if (stack[stack.length - 1] === GAME_STAGE.EXILE_FINISH_STAGE) {
          stack.pop()
        }
        await Game.findByIdAndUpdate(game._id, { lastWordPlayers: [], lastWordContext: '', currentLastWordPosition: -1 })
      }
      await Game.findByIdAndUpdate(game._id, { pkCandidates: [] })
      break
    }
    default:
  }
}

export async function updateStackToNext(gameId) {
  const game = await Game.findById(gameId)
  const stack = [...game.stageStack]
  const nextStage = stack.pop()
  await Game.findByIdAndUpdate(gameId, { stage: nextStage ?? GAME_STAGE.READY, stageStack: stack })
  io?.to('room:' + game.roomId).emit('stageChange')
}

export async function moveToNightReady(gameId) {
  const game = await Game.findById(gameId)
  
  const isOver = await settleGameOver(gameId)
  if (isOver) {
    io?.to('room:' + game.roomId).emit('refreshGame')
    return game
  }

  const modeConfig = MODE[game.mode]
  const nextDay = game.day + 1
  const stageStack = buildStageStack(modeConfig)

  await Game.findByIdAndUpdate(gameId, {
    day: nextDay,
    stage: GAME_STAGE.READY,
    stageStack,
    pkCandidates: [],
    currentSpeakerPosition: -1,
    speakStartPosition: -1,
    speakOrderDirection: 1,
    lastWordPlayers: [],
    lastWordContext: '',
    currentLastWordPosition: -1
  })

  const updatedGame = await Game.findById(gameId)
  await recordService.nightBeginRecord(updatedGame, updatedGame.day, GAME_STAGE.READY)
  return updatedGame
}

export async function getGameByUsername(username) {
  const player = await Player.findOne({ username }).sort({ createdAt: -1 })
  if (!player) return null
  const game = await Game.findById(player.gameId)
  return game
}

export async function recoverActiveGames() {
  try {
    const activeGames = await Game.find({ status: GAME_STATUS.GOING })
    if (activeGames.length === 0) return
    logger.info(`[recovery] Found ${activeGames.length} active game(s) to recover`)
    for (const game of activeGames) {
      const gameId = String(game._id)
      // Don't overwrite a timer that somehow already exists
      if (timers.has(gameId)) continue
      logger.info(`[recovery] Restarting timer for game ${gameId} at stage ${game.stage}`)
      await startStageTimer(gameId, game)
    }
  } catch (e) {
    logger.error(`[recovery] Failed to recover active games: ${e.message}`)
  }
}


export async function getStageTimerDuration(gameId, game) {
  switch (game.stage) {
    case GAME_STAGE.READY:
      return 5
    case GAME_STAGE.PREDICTOR_STAGE:
      return normalizeActionTime(game.predictorActionTime, 15, 10, 30)
    case GAME_STAGE.WOLF_STAGE:
      return normalizeActionTime(game.wolfActionTime, 15, 10, 30)
    case GAME_STAGE.WITCH_STAGE:
      return normalizeActionTime(game.witchActionTime, 15, 10, 30)
    case GAME_STAGE.AFTER_NIGHT: {
      // On day 2+, night kills have no last-words stage, so a dead hunter's only
      // shooting window is during AFTER_NIGHT — give them sufficient time.
      if (game.day > 1) {
        const hasHunterShoot = await checkPendingHunterShoot(gameId)
        if (hasHunterShoot) return normalizeActionTime(game.predictorActionTime, 15, 10, 30)
      }
      return 5
    }
    case GAME_STAGE.SPEAK_STAGE:
      return normalizeActionTime(game.speakActionTime, 60, 30, 120)
    case GAME_STAGE.VOTE_STAGE:
    case GAME_STAGE.VOTE_PK_STAGE:
      return normalizeActionTime(game.voteActionTime, 30, 5, 30)
    case GAME_STAGE.EXILE_FINISH_STAGE: {
      if (game.lastWordPlayers && game.lastWordPlayers.length > 0) {
        return normalizeActionTime(game.speakActionTime, 60, 30, 120)
      }
      const hasHunterShoot = await checkPendingHunterShoot(gameId)
      // Only reached when hunter has a pending shoot (no-shoot case is handled earlier by scheduleImmediateAdvance)
      return hasHunterShoot ? normalizeActionTime(game.speakActionTime, 60, 30, 120) : 0
    }
    default:
      return 0
  }
}

export async function startStageTimer(gameId, game) {
  // Clean up any existing timer to prevent duplicate intervals
  const existingTimer = timers.get(String(gameId))
  if (existingTimer) {
    clearInterval(existingTimer)
    timers.delete(String(gameId))
  }

  const duration = await getStageTimerDuration(gameId, game)
  if (!duration || duration <= 0) return

  const cacheKey = 'game-time-' + gameId
  cache.set(cacheKey, duration)
  // Emit initial value so clients see the countdown immediately
  io?.to('room:' + game.roomId).emit('timer', { refreshGame: false, time: duration })

  const timer = setInterval(async () => {
    const current = cache.get(cacheKey)
    if (current === undefined || current <= 0) {
      clearInterval(timer)
      timers.delete(String(gameId))
      // Trigger auto-advance if time reached 0, or if cache was unexpectedly cleared (undefined)
      if (current === 0 || current === undefined) {
        const g = await Game.findById(gameId)
        if (g && g.status === GAME_STATUS.GOING) {
          if (current === undefined) {
            logger.warn(`[timer] cache miss for game ${gameId} at stage ${g.stage}, forcing auto-advance`)
          }
          if (g.stage === GAME_STAGE.SPEAK_STAGE) {
            await autoAdvanceSpeaker(gameId)
          } else if (g.stage === GAME_STAGE.EXILE_FINISH_STAGE) {
            await advanceLastWordSpeaker(gameId)
          } else {
            await moveToNextStage(gameId)
          }
        }
      }
      return
    }
    const next = current - 1
    cache.set(cacheKey, next)
    io?.to('room:' + game.roomId).emit('timer', { refreshGame: false, time: next })
  }, 1000)

  timers.set(String(gameId), timer)
}

export async function autoAdvanceSpeaker(gameId) {
  const key = String(gameId) + '_speaker'
  if (advancingSpeakers.has(key)) return
  advancingSpeakers.add(key)
  try {
    const game = await Game.findById(gameId)
    if (!game || game.stage !== GAME_STAGE.SPEAK_STAGE || game.status !== GAME_STATUS.GOING) return

    let speakers = []
    if (game.pkCandidates && game.pkCandidates.length > 0) {
      speakers = await Player.find({ gameId: String(gameId), status: PLAYER_STATUS.ALIVE, username: { $in: game.pkCandidates } }).sort({ position: 1 })
    } else {
      speakers = await Player.find({ gameId: String(gameId), status: PLAYER_STATUS.ALIVE }).sort({ position: 1 })
    }

    if (speakers.length === 0) {
      await moveToNextStage(gameId)
      return
    }

    const positions = speakers.map((p) => p.position)
    const currentIdx = positions.indexOf(game.currentSpeakerPosition)
    const dir = game.speakOrderDirection ?? 1
    const nextIdx = (currentIdx + dir + positions.length) % positions.length
    const nextPosition = positions[nextIdx]
    const speakStartPosition = game.speakStartPosition ?? -1

    if (speakStartPosition !== -1 && nextPosition === speakStartPosition) {
      await moveToNextStage(gameId)
    } else {
      await Game.findByIdAndUpdate(gameId, { currentSpeakerPosition: nextPosition })
      const updatedGame = await Game.findById(gameId)
      io?.to('room:' + game.roomId).emit('stageChange')
      await startStageTimer(gameId, updatedGame)
    }
  } finally {
    advancingSpeakers.delete(key)
  }
}

function buildStageStack(modeConfig) {
  return [...modeConfig.STAGE].filter((stage) => stage !== GAME_STAGE.READY).reverse()
}

export async function advanceLastWordSpeaker(gameId) {
  const gameIdStr = String(gameId) + '_lastword'
  if (advancingLastWord.has(gameIdStr)) return
  advancingLastWord.add(gameIdStr)
  try {
    const game = await Game.findById(gameId)
    if (!game || game.stage !== GAME_STAGE.EXILE_FINISH_STAGE || game.status !== GAME_STATUS.GOING) return

    const lastWordPlayers = game.lastWordPlayers || []
    const currentIdx = lastWordPlayers.indexOf(game.currentLastWordPosition)
    const nextIdx = currentIdx + 1

    if (nextIdx >= lastWordPlayers.length) {
      await moveToNextStage(gameId)
    } else {
      const nextPosition = lastWordPlayers[nextIdx]
      await Game.findByIdAndUpdate(gameId, { currentLastWordPosition: nextPosition })
      const updatedGame = await Game.findById(gameId)
      io?.to('room:' + game.roomId).emit('stageChange')
      await startStageTimer(gameId, updatedGame)
    }
  } finally {
    advancingLastWord.delete(gameIdStr)
  }
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function normalizeActionTime(input, fallback, min = 30, max = Infinity) {
  const value = Number(input ?? fallback)
  const base = Number.isFinite(value) ? value : (Number(fallback) || min)
  return Math.min(max, Math.max(min, base))
}

function shouldExposeSkillForStage(player, skill, game, hasUsedWitchSkill) {
  switch (skill.key) {
    case SKILL_ACTION_KEY.CHECK:
      return player.role === GAME_ROLE.PREDICTOR && player.status === PLAYER_STATUS.ALIVE && game.stage === GAME_STAGE.PREDICTOR_STAGE
    case SKILL_ACTION_KEY.ASSAULT:
      return false
    case SKILL_ACTION_KEY.ANTIDOTE:
    case SKILL_ACTION_KEY.POISON:
      return player.role === GAME_ROLE.WITCH
        && player.status === PLAYER_STATUS.ALIVE
        && game.stage === GAME_STAGE.WITCH_STAGE
        && skill.status === SKILL_STATUS.AVAILABLE
        && !hasUsedWitchSkill
    case SKILL_ACTION_KEY.SHOOT:
      return player.role === GAME_ROLE.HUNTER
        && player.status === PLAYER_STATUS.DEAD
        && player.outReason !== GAME_OUT_REASON.POISON
        && skill.status === SKILL_STATUS.AVAILABLE
        && (game.stage === GAME_STAGE.AFTER_NIGHT || game.stage === GAME_STAGE.EXILE_FINISH_STAGE)
    default:
      return false
  }
}

function getVisionStatus(currentPlayer, targetPlayer, checkedTargets) {
  if (!currentPlayer || !targetPlayer) return VISION_STATUS.UNKNOWN
  if (currentPlayer.username === targetPlayer.username) return VISION_STATUS.KNOWN_ROLE
  if (currentPlayer.role === GAME_ROLE.WOLF && targetPlayer.role === GAME_ROLE.WOLF) {
    return VISION_STATUS.KNOWN_ROLE
  }
  if (currentPlayer.role === GAME_ROLE.PREDICTOR && checkedTargets.has(targetPlayer.username)) {
    return VISION_STATUS.KNOWN_CAMP
  }
  return VISION_STATUS.UNKNOWN
}

export async function checkPendingHunterShoot(gameId) {
  const game = await Game.findById(gameId)
  if (!game) return false
  const players = await Player.find({ gameId: String(gameId), role: GAME_ROLE.HUNTER, status: PLAYER_STATUS.DEAD })
  for (const player of players) {
    if (player.outReason === GAME_OUT_REASON.POISON) continue
    const shootSkill = (player.skill || []).find((s) => s.key === SKILL_ACTION_KEY.SHOOT)
    if (shootSkill && shootSkill.status === SKILL_STATUS.AVAILABLE) {
      return true
    }
  }
  return false
}
