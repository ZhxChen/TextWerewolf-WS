import { Game, Player, Action, Vision } from '../models/index.js'
import { GAME_STAGE, GAME_ROLE, SKILL_ACTION_KEY, PLAYER_STATUS, SKILL_STATUS, GAME_OUT_REASON, GAME_WITCH_SAVE_SELF } from '../config/constants.js'
import * as recordService from './recordService.js'
import * as playerService from './playerService.js'
import { findMaxValue, getPlayerFullName } from '../utils/helper.js'
import { cache } from '../state.js'

export async function predictorStage(gameId) {
  const gameInstance = await Game.findById(gameId)
  if (!gameInstance) return

  const predictor = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, role: GAME_ROLE.PREDICTOR, status: PLAYER_STATUS.ALIVE })
  if (!predictor) return

  const cacheKey = `predictor-selection-${gameId}`
  const targetUsername = cache.get(cacheKey)
  cache.del(cacheKey)

  let checkAction = null
  let targetPlayer = null

  if (targetUsername) {
    targetPlayer = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: targetUsername, status: PLAYER_STATUS.ALIVE })
    if (targetPlayer && targetPlayer.username !== predictor.username) {
      // Find and update the Vision status to 1
      const visionInstance = await Vision.findOne({
        roomId: gameInstance.roomId,
        gameId: String(gameId),
        from: predictor.username,
        to: targetUsername
      })
      if (visionInstance) {
        await Vision.findByIdAndUpdate(visionInstance._id, { status: 1 })
      }

      // Create the CHECK Action
      checkAction = await Action.create({
        roomId: gameInstance.roomId,
        gameId: String(gameId),
        day: gameInstance.day,
        stage: GAME_STAGE.PREDICTOR_STAGE,
        from: predictor.username,
        to: targetUsername,
        action: SKILL_ACTION_KEY.CHECK
      })
      await recordService.actionRecord(gameInstance, predictor, targetPlayer, SKILL_ACTION_KEY.CHECK)
    }
  }

  if (!checkAction) {
    await recordService.emptyActionRecord(gameInstance, predictor)
  }
}

export async function wolfStage(gameId) {
  const gameInstance = await Game.findById(gameId)
  if (!gameInstance) return

  const aliveWolves = await Player.find({ gameId: String(gameId), roomId: gameInstance.roomId, role: GAME_ROLE.WOLF, status: PLAYER_STATUS.ALIVE })
  const aliveWolfUsernames = new Set(aliveWolves.map(w => w.username))

  const cacheKey = `wolf-selections-${gameId}`
  const selections = cache.get(cacheKey) || {}

  // Filter selections to only alive wolves
  const targets = []
  for (const [voter, target] of Object.entries(selections)) {
    if (aliveWolfUsernames.has(voter) && target) {
      targets.push(target)
    }
  }

  // Clear the cache for the next night/game
  cache.del(cacheKey)

  let target

  if (targets.length === 0) {
    // No wolf voted — randomly pick any alive non-wolf player
    const alivePlayers = await Player.find({ gameId: String(gameId), roomId: gameInstance.roomId, status: PLAYER_STATUS.ALIVE, role: { $ne: GAME_ROLE.WOLF } })
    if (alivePlayers.length === 0) return
    target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].username
  } else {
    const maxTargets = findMaxValue(targets)
    // Tie or single winner — randomly pick from top-voted targets
    target = maxTargets[Math.floor(Math.random() * maxTargets.length)]
  }

  const targetPlayer = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: target })
  if (!targetPlayer) return

  await Action.create({
    roomId: gameInstance.roomId,
    gameId: String(gameId),
    day: gameInstance.day,
    stage: GAME_STAGE.WOLF_STAGE,
    from: 'wolf_team',
    to: target,
    action: SKILL_ACTION_KEY.KILL
  })
  await recordService.wolfTeamAssaultRecord(gameInstance, targetPlayer)
}

export async function witchStage(gameId) {
  const gameInstance = await Game.findById(gameId)
  if (!gameInstance) return

  const witch = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, role: GAME_ROLE.WITCH, status: PLAYER_STATUS.ALIVE })
  if (!witch) return

  const cacheKey = `witch-selections-${gameId}`
  const selections = cache.get(cacheKey) || { antidote: false, poisonTargetUsername: null }
  cache.del(cacheKey)

  const killAction = await Action.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, day: gameInstance.day, stage: GAME_STAGE.WOLF_STAGE, action: SKILL_ACTION_KEY.KILL })

  let actionCreated = null

  if (selections.antidote && killAction) {
    const antidoteSkill = (witch.skill || []).find((s) => s.key === SKILL_ACTION_KEY.ANTIDOTE)
    const canUseAntidote = antidoteSkill && antidoteSkill.status === SKILL_STATUS.AVAILABLE

    let selfSaveAllowed = true
    if (killAction.to === witch.username) {
      if (gameInstance.witchSaveSelf === GAME_WITCH_SAVE_SELF.NO_SAVE_SELF) {
        selfSaveAllowed = false
      } else if (gameInstance.witchSaveSelf === GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT && gameInstance.day > 1) {
        selfSaveAllowed = false
      }
    }

    if (canUseAntidote && selfSaveAllowed) {
      const diePlayer = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: killAction.to })
      if (diePlayer) {
        actionCreated = await Action.create({
          roomId: gameInstance.roomId,
          gameId: String(gameId),
          day: gameInstance.day,
          stage: GAME_STAGE.WITCH_STAGE,
          from: witch.username,
          to: killAction.to,
          action: SKILL_ACTION_KEY.ANTIDOTE
        })
        await recordService.actionRecord(gameInstance, witch, diePlayer, SKILL_ACTION_KEY.ANTIDOTE)
        await playerService.modifyPlayerSkill(witch, SKILL_ACTION_KEY.ANTIDOTE, SKILL_STATUS.UNAVAILABLE)
      }
    }
  }

  // If antidote wasn't used/valid, see if poison was selected
  if (!actionCreated && selections.poisonTargetUsername) {
    const poisonSkill = (witch.skill || []).find((s) => s.key === SKILL_ACTION_KEY.POISON)
    const canUsePoison = poisonSkill && poisonSkill.status === SKILL_STATUS.AVAILABLE

    if (canUsePoison) {
      const targetPlayer = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: selections.poisonTargetUsername, status: PLAYER_STATUS.ALIVE })
      if (targetPlayer) {
        actionCreated = await Action.create({
          roomId: gameInstance.roomId,
          gameId: String(gameId),
          day: gameInstance.day,
          stage: GAME_STAGE.WITCH_STAGE,
          from: witch.username,
          to: selections.poisonTargetUsername,
          action: SKILL_ACTION_KEY.POISON
        })
        await playerService.modifyPlayerSkill(witch, SKILL_ACTION_KEY.POISON, SKILL_STATUS.UNAVAILABLE)
      }
    }
  }

  if (!actionCreated) {
    await recordService.emptyActionRecord(gameInstance, witch)
  }
}

export async function settleStage(gameId) {
  const gameInstance = await Game.findById(gameId)
  const deadPlayers = []

  const killAction = await Action.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, day: gameInstance.day, stage: GAME_STAGE.WOLF_STAGE, action: SKILL_ACTION_KEY.KILL })
  if (killAction) {
    const antidoteAction = await Action.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, day: gameInstance.day, stage: GAME_STAGE.WITCH_STAGE, action: SKILL_ACTION_KEY.ANTIDOTE })
    if (!antidoteAction) {
      const killed = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: killAction.to })
      if (killed && killed.status === PLAYER_STATUS.ALIVE) {
        deadPlayers.push({ player: killed, reason: GAME_OUT_REASON.ASSAULT })
      }
    }
  }

  const poisonAction = await Action.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, day: gameInstance.day, stage: GAME_STAGE.WITCH_STAGE, action: SKILL_ACTION_KEY.POISON })
  if (poisonAction) {
    const poisoned = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: poisonAction.to })
    if (poisoned && poisoned.status === PLAYER_STATUS.ALIVE) {
      deadPlayers.push({ player: poisoned, reason: GAME_OUT_REASON.POISON })
    }
  }

  for (const { player, reason } of deadPlayers) {
    await Player.findByIdAndUpdate(player._id, { status: PLAYER_STATUS.DEAD, outReason: reason })
    await recordService.deadRecord(gameInstance, player)
    if (player.role === GAME_ROLE.HUNTER && reason !== GAME_OUT_REASON.POISON) {
      await playerService.modifyPlayerSkill(player, SKILL_ACTION_KEY.SHOOT, SKILL_STATUS.AVAILABLE)
    }
  }

  if (deadPlayers.length === 0) {
    await recordService.peaceRecord(gameInstance)
  }

  // Return unique positions of dead players for last-words injection
  return [...new Set(deadPlayers.map(({ player }) => player.position))]
}

export async function preSpeakStage(gameId) {
  const gameInstance = await Game.findById(gameId)
  let speakers = []
  if (gameInstance.pkCandidates && gameInstance.pkCandidates.length > 0) {
    speakers = await Player.find({ gameId: String(gameId), roomId: gameInstance.roomId, username: { $in: gameInstance.pkCandidates }, status: PLAYER_STATUS.ALIVE }).sort({ position: 1 })
  } else {
    speakers = await Player.find({ gameId: String(gameId), roomId: gameInstance.roomId, status: PLAYER_STATUS.ALIVE }).sort({ position: 1 })
  }
  if (speakers.length === 0) return
  const startIdx = Math.floor(Math.random() * speakers.length)
  const randomOrder = Math.random() > 0.5 ? 1 : -1
  const startPlayer = speakers[startIdx]
  await Game.findByIdAndUpdate(gameId, {
    currentSpeakerPosition: startPlayer.position,
    speakStartPosition: startPlayer.position,
    speakOrderDirection: randomOrder === 1 ? 1 : -1
  })
  await recordService.speakRecord(gameInstance, startPlayer, randomOrder === 1 ? 1 : 0)
}

export async function voteStage(gameId) {
  const gameInstance = await Game.findById(gameId)
  const voteStageVal = gameInstance.stage  // Use actual current stage (VOTE_STAGE or VOTE_PK_STAGE)

  const voteActions = await Action.find({ gameId: String(gameId), roomId: gameInstance.roomId, day: gameInstance.day, stage: voteStageVal, action: SKILL_ACTION_KEY.VOTE })

  if (voteActions.length === 0) {
    await recordService.abstainedRecord(gameInstance, null)
    return { exiled: null }
  }

  const alivePlayers = await Player.find({ gameId: String(gameId), roomId: gameInstance.roomId, status: PLAYER_STATUS.ALIVE })
  const votedUsernames = voteActions.map((a) => a.from)
  const abstained = alivePlayers.filter((p) => !votedUsernames.includes(p.username))

  const voteMap = {}
  for (const va of voteActions) {
    if (!voteMap[va.to]) voteMap[va.to] = []
    const voter = alivePlayers.find((p) => p.username === va.from)
    voteMap[va.to].push({ username: va.from, position: voter?.position })
  }

  for (const key of Object.keys(voteMap)) {
    await recordService.voteRecord(gameInstance, voteMap, key)
  }

  if (abstained.length > 0) {
    await recordService.abstainedRecord(gameInstance, abstained)
  }

  const totals = Object.entries(voteMap).map(([k, v]) => ({ username: k, count: v.length }))
  const maxVotes = Math.max(...totals.map((t) => t.count))
  const maxCandidates = totals.filter((t) => t.count === maxVotes).map((t) => t.username)

  if (maxCandidates.length > 1) {
    await recordService.flatTicketRecord(gameInstance)
    return { exiled: null, tie: true, candidates: maxCandidates }
  }

  const exiledUsername = maxCandidates[0]
  const exiledPlayer = await Player.findOne({ gameId: String(gameId), roomId: gameInstance.roomId, username: exiledUsername })
  await recordService.exileRecord(gameInstance, exiledPlayer)
  await Player.findByIdAndUpdate(exiledPlayer._id, { status: PLAYER_STATUS.DEAD, outReason: GAME_OUT_REASON.EXILE })
  if (exiledPlayer.role === GAME_ROLE.HUNTER) {
    await playerService.modifyPlayerSkill(exiledPlayer, SKILL_ACTION_KEY.SHOOT, SKILL_STATUS.AVAILABLE)
  }
  return { exiled: exiledPlayer }
}

