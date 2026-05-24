import { Game, Room, Player, Action, Vision, Record, ChatMessage } from '../models/index.js'
import { Result } from '../utils/response.js'
import { isEmpty, isOb, getGameWinner } from '../utils/helper.js'
import { io, timers, cache } from '../state.js'
import * as gameService from '../services/gameService.js'
import * as stageService from '../services/stageService.js'
import * as recordService from '../services/recordService.js'
import * as actionService from '../services/actionService.js'
import * as playerService from '../services/playerService.js'
import * as tagService from '../services/tagService.js'
import * as roomService from '../services/roomService.js'
import { GAME_STATUS, GAME_STAGE, GAME_ROLE, PLAYER_STATUS, SKILL_ACTION_KEY, SKILL_STATUS, ROOM_STATUS, GAME_OUT_REASON, GAME_TICKET_FLAT, GAME_WITCH_SAVE_SELF, MODE, ALLOWED_GAME_MODES } from '../config/constants.js'

function buildGameConfig(room, extra = {}) {
  const nightTime = Math.min(30, Math.max(10, Number(room.nightActionTime) || 15))
  const speakTime = Math.min(120, Math.max(30, Number(room.speakActionTime) || 60))
  const voteTime = Math.min(30, Math.max(5, Number(room.voteActionTime) || 30))
  return {
    ...extra,
    predictorActionTime: nightTime,
    wolfActionTime: nightTime,
    witchActionTime: nightTime,
    speakActionTime: speakTime,
    voteActionTime: voteTime
  }
}

async function saveActionOrFail(ctx, game, action, from, to, duplicateMessage) {
  try {
    await actionService.saveAction(game, action, from, to)
    return true
  } catch (error) {
    if (actionService.isActionConflictError(error)) {
      ctx.body = Result.fail(-1, duplicateMessage)
      return false
    }
    throw error
  }
}

export async function gameStart(ctx) {
  const { roomId, mode, config: configData } = ctx.request.body
  if (isEmpty(roomId)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (room.status === ROOM_STATUS.GOING) {
    ctx.body = Result.fail(-1, '游戏已经开始')
    return
  }
  if (room.owner !== ctx.userInfo.username && ctx.userInfo.role !== 'admin') {
    ctx.body = Result.fail(-1, '只有房主才能开始游戏')
    return
  }
  const seatedPlayers = room.seats.filter((s) => s)
  if (!ALLOWED_GAME_MODES.includes(room.mode)) {
    ctx.body = Result.fail(-1, '不支持的游戏模式')
    return
  }
  const modeConfig = MODE[room.mode]
  if (seatedPlayers.length !== modeConfig.count) {
    ctx.body = Result.fail(-1, `玩家数量不足，需要${modeConfig.count}人`)
    return
  }

  const game = await gameService.createNewGame(roomId, buildGameConfig(room, configData))
  await Room.findByIdAndUpdate(roomId, { status: ROOM_STATUS.GOING, gameId: String(game._id) })

  io?.to('room:' + roomId).emit('gameStart')
  await gameService.startStageTimer(String(game._id), game)
  ctx.body = Result.success({ gameId: String(game._id) })
}

export async function gameInfo(ctx) {
  const { id: gameId, roomId } = ctx.query
  if (isEmpty(gameId) || isEmpty(roomId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game) {
    ctx.body = Result.fail(-1, '游戏不存在')
    return
  }
  const room = await Room.findById(game.roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (String(room._id) !== String(roomId)) {
    ctx.body = Result.fail(-1, '房间与游戏不匹配')
    return
  }
  if (!roomService.canAccessRoom(room, ctx.userInfo)) {
    ctx.body = Result.fail(-1, '无权访问该房间')
    return
  }
  const username = ctx.userInfo.username
  const currentPlayer = await Player.findOne({ roomId: game.roomId, gameId: String(gameId), username })
  const isObserver = !currentPlayer && isOb(room, username)

  const playerInfo = await gameService.getPlayerInfoInGame(gameId, username, isObserver)
  const skillInfo = await gameService.getSkillStatusInGame(gameId, username)
  const broadcast = await gameService.getBroadcastInfo(gameId)
  const action = await gameService.getActionStatusInGame(gameId, username)
  const witchInfo = await gameService.getWitchStageInfo(gameId, username)

  const roleInfo = currentPlayer
    ? {
        role: currentPlayer.role,
        roleName: currentPlayer.roleName,
        camp: currentPlayer.camp,
        campName: currentPlayer.campName,
        position: currentPlayer.position,
        status: currentPlayer.status,
        outReason: currentPlayer.outReason
      }
    : null

  const wolfSelections = (
    game.stage === GAME_STAGE.WOLF_STAGE
    && currentPlayer?.role === GAME_ROLE.WOLF
    && currentPlayer?.status === PLAYER_STATUS.ALIVE
  ) ? (cache.get(`wolf-selections-${gameId}`) || {}) : null

  const predictorSelection = (
    game.stage === GAME_STAGE.PREDICTOR_STAGE
    && currentPlayer?.role === GAME_ROLE.PREDICTOR
    && currentPlayer?.status === PLAYER_STATUS.ALIVE
  ) ? (cache.get(`predictor-selection-${gameId}`) || null) : null

  const witchSelections = (
    game.stage === GAME_STAGE.WITCH_STAGE
    && currentPlayer?.role === GAME_ROLE.WITCH
    && currentPlayer?.status === PLAYER_STATUS.ALIVE
  ) ? (cache.get(`witch-selections-${gameId}`) || { antidote: false, poisonTargetUsername: null }) : null

  const remainingTime = cache.get('game-time-' + gameId) ?? null

  const voteStages = new Set([GAME_STAGE.VOTE_STAGE, GAME_STAGE.VOTE_PK_STAGE])
  let voteSelections = null
  if (voteStages.has(game.stage) && currentPlayer?.status === PLAYER_STATUS.ALIVE) {
    const voteActions = await Action.find({ gameId: String(gameId), roomId, day: game.day, stage: game.stage, action: SKILL_ACTION_KEY.VOTE })
    voteSelections = {}
    for (const a of voteActions) {
      voteSelections[a.from] = a.to
    }
  }

  ctx.body = Result.success({
    _id: game._id,
    roomId: game.roomId,
    status: game.status,
    stage: game.stage,
    day: game.day,
    mode: game.mode,
    winner: game.winner,
    winnerString: game.winnerString,
    currentSpeakerPosition: game.currentSpeakerPosition,
    speakOrderDirection: game.speakOrderDirection,
    pkCandidates: game.pkCandidates || [],
    isOb: isObserver,
    playerInfo,
    skill: skillInfo,
    broadcast,
    action,
    roleInfo,
    witchInfo,
    wolfSelections,
    predictorSelection,
    witchSelections,
    voteSelections,
    remainingTime,
    lastWordPlayers: game.lastWordPlayers || [],
    currentLastWordPosition: game.currentLastWordPosition ?? -1
  })
}

export async function nextStage(ctx) {
  const { roomId, gameId, role } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game) {
    ctx.body = Result.fail(-1, '游戏不存在')
    return
  }
  if (game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, '游戏已结束')
    return
  }

  // Disallow manual advancing of night stages (1: PREDICTOR_STAGE, 2: WOLF_STAGE, 3: WITCH_STAGE)
  if ([GAME_STAGE.PREDICTOR_STAGE, GAME_STAGE.WOLF_STAGE, GAME_STAGE.WITCH_STAGE].includes(game.stage)) {
    ctx.body = Result.fail(-1, '黑夜行动阶段必须等待时间结束，不能提前推进')
    return
  }

  const currentUser = ctx.userInfo
  const room = await Room.findById(game.roomId)
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  const isObserver = !currentPlayer && isOb(room, currentUser.username)

  if (!isObserver && !currentPlayer) {
    ctx.body = Result.fail(-1, '未查询到你在该游戏中')
    return
  }

  if (role) {
    if (!currentPlayer || role !== currentPlayer.role) {
      ctx.body = Result.fail(-1, 'role身份前后端校验不通过')
      return
    }
    const stageCheck = {
      [GAME_ROLE.PREDICTOR]: GAME_STAGE.PREDICTOR_STAGE,
      [GAME_ROLE.WOLF]: GAME_STAGE.WOLF_STAGE,
      [GAME_ROLE.WITCH]: GAME_STAGE.WITCH_STAGE
    }
    if (!stageCheck[role]) {
      ctx.body = Result.fail(-1, '当前阶段不能由该角色主动结束')
      return
    }
    if (game.stage !== stageCheck[role]) {
      ctx.body = Result.fail(-1, 'role身份前后端校验不通过（不是你的回合）')
      return
    }
  } else if (room.owner !== currentUser.username && currentUser.role !== 'admin') {
    ctx.body = Result.fail(-1, '您不是房主，无权进行此操作')
    return
  }

  const timerId = timers.get(String(gameId))
  if (timerId) {
    cache.set('game-time-' + gameId, -1)
    clearInterval(timerId)
    timers.delete(String(gameId))
  }

  await new Promise((r) => setTimeout(r, 200))
  await gameService.moveToNextStage(gameId)
  ctx.body = Result.success('操作成功')
}

export async function commonGameRecord(ctx) {
  const { roomId, gameId } = ctx.query
  if (isEmpty(roomId) || isEmpty(gameId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game) {
    ctx.body = Result.fail(-1, '游戏不存在')
    return
  }
  const room = await Room.findById(game.roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (String(room._id) !== String(roomId)) {
    ctx.body = Result.fail(-1, '房间与游戏不匹配')
    return
  }
  if (!roomService.canAccessRoom(room, ctx.userInfo)) {
    ctx.body = Result.fail(-1, '无权访问该房间')
    return
  }
  const username = ctx.userInfo.username
  const currentPlayer = await Player.findOne({ roomId: game.roomId, gameId: String(gameId), username })

  const query = { roomId: game.roomId, gameId: String(gameId) }
  if (game.status === GAME_STATUS.GOING) {
    query.isCommon = 1
  }

  const recordList = await Record.find(query).sort({ _id: -1 })
  const tagMap = {}

  const filterRecord = (record) => {
    const condition = (target, action) => {
      if (!target.role) return false
      if (target.role === 'out' || target.role === 'exile' || target.role === 'boom') return false
      if (action === SKILL_ACTION_KEY.SHOOT) return false
      return game.status === GAME_STATUS.GOING
    }

    if (record.content && record.content.type === 'action') {
      return {
        ...record.toObject(),
        content: {
          ...record.content,
          from: {
            ...record.content.from,
            role: condition(record.content.from, record.content.action) ? null : record.content.from?.role,
            camp: condition(record.content.from, record.content.action) ? null : record.content.from?.camp
          },
          to: {
            ...record.content.to,
            role: condition(record.content.to) ? null : record.content.to?.role,
            camp: condition(record.content.to) ? null : record.content.to?.camp
          }
        }
      }
    }
    return record.toObject ? record.toObject() : record
  }

  recordList.forEach((item) => {
    const day = item.day
    if (tagMap[day]) {
      tagMap[day].content.push(filterRecord(item))
    } else {
      const c = []
      if (day !== 0 && day !== undefined) {
        c.push({ isTitle: 1, content: { text: '第' + day + '天', type: 'text', level: 1 } })
      }
      c.push(filterRecord(item))
      tagMap[day] = { key: day, content: c }
    }
  })

  ctx.body = Result.success(tagMap)
}

export async function checkPlayer(ctx) {
  const { roomId, gameId, username } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId) || isEmpty(username)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.PREDICTOR_STAGE) {
    ctx.body = Result.fail(-1, '该阶段不能进行查验操作')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer) {
    ctx.body = Result.fail(-1, '未查询到你在该游戏中')
    return
  }
  if (currentPlayer.role !== GAME_ROLE.PREDICTOR) {
    ctx.body = Result.fail(-1, '您在游戏中的角色不是预言家，无法使用该技能')
    return
  }
  if (currentPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '您已出局，无法再使用该技能')
    return
  }
  const checkedAction = await Action.findOne({
    roomId,
    gameId: String(gameId),
    from: currentUser.username,
    to: username,
    action: SKILL_ACTION_KEY.CHECK
  })
  if (checkedAction) {
    ctx.body = Result.fail(-1, '您已查验过该玩家的身份')
    return
  }
  const exist = await Action.findOne({ roomId, gameId: String(gameId), from: currentUser.username, day: game.day, stage: GAME_STAGE.PREDICTOR_STAGE, action: SKILL_ACTION_KEY.CHECK })
  if (exist) {
    ctx.body = Result.fail(-1, '今天你已使用过查验功能')
    return
  }
  const targetPlayer = await Player.findOne({ roomId, gameId: String(gameId), username })
  if (!targetPlayer) {
    ctx.body = Result.fail(-1, '目标玩家不存在')
    return
  }
  if (targetPlayer.username === currentPlayer.username) {
    ctx.body = Result.fail(-1, '不能查验自己')
    return
  }
  if (targetPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '该玩家已出局')
    return
  }
  const visionInstance = await Vision.findOne({ roomId, gameId: String(gameId), from: currentUser.username, to: username })
  if (visionInstance) {
    await Vision.findByIdAndUpdate(visionInstance._id, { status: 1 })
  }
  if (!await saveActionOrFail(ctx, game, SKILL_ACTION_KEY.CHECK, currentPlayer.username, targetPlayer.username, '今天你已使用过查验功能')) return
  await recordService.actionRecord(game, currentPlayer, targetPlayer, SKILL_ACTION_KEY.CHECK)
  io?.to('room:' + game.roomId).emit('refreshGame')
  ctx.body = Result.success({ username: targetPlayer.username, name: targetPlayer.name, position: targetPlayer.position, camp: targetPlayer.camp, campName: targetPlayer.campName })
}

export async function assaultPlayer(ctx) {
  const { roomId, gameId, username } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId) || isEmpty(username)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.WOLF_STAGE) {
    ctx.body = Result.fail(-1, '该阶段不能进行袭击操作')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer || currentPlayer.role !== GAME_ROLE.WOLF) {
    ctx.body = Result.fail(-1, '您在游戏中的角色不是狼人，无法使用该技能')
    return
  }
  if (currentPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '您已出局，无法再使用该技能')
    return
  }
  const exist = await Action.findOne({ roomId, gameId: String(gameId), from: currentUser.username, day: game.day, stage: GAME_STAGE.WOLF_STAGE, action: SKILL_ACTION_KEY.ASSAULT })
  if (exist) {
    ctx.body = Result.fail(-1, '今天你已使用过袭击功能')
    return
  }
  const targetPlayer = await Player.findOne({ roomId, gameId: String(gameId), username })
  if (!targetPlayer) {
    ctx.body = Result.fail(-1, '目标玩家不存在')
    return
  }
  if (targetPlayer.username === currentPlayer.username) {
    ctx.body = Result.fail(-1, '不能袭击自己')
    return
  }
  if (targetPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '该玩家已出局')
    return
  }
  if (!await saveActionOrFail(ctx, game, SKILL_ACTION_KEY.ASSAULT, currentPlayer.username, targetPlayer.username, '今天你已使用过袭击功能')) return
  ctx.body = Result.success({ username: targetPlayer.username, name: targetPlayer.name, position: targetPlayer.position })
}

export async function antidotePlayer(ctx) {
  const { roomId, gameId } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.WITCH_STAGE) {
    ctx.body = Result.fail(-1, '该阶段不能进行解药操作')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer || currentPlayer.role !== GAME_ROLE.WITCH) {
    ctx.body = Result.fail(-1, '您在游戏中的角色不是女巫，无法使用该技能')
    return
  }
  if (currentPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '您已出局，无法再使用该技能')
    return
  }
  const antidoteSkill = (currentPlayer.skill || []).find((s) => s.key === SKILL_ACTION_KEY.ANTIDOTE)
  if (!antidoteSkill || antidoteSkill.status === SKILL_STATUS.UNAVAILABLE) {
    ctx.body = Result.fail(-1, '您当前状态不能使用该技能')
    return
  }
  const killAction = await Action.findOne({ gameId: String(gameId), roomId, day: game.day, stage: GAME_STAGE.WOLF_STAGE, action: SKILL_ACTION_KEY.KILL })
  if (!killAction) {
    ctx.body = Result.fail(-1, '当天没有玩家死亡，无需使用解药')
    return
  }
  // Check witch save-self rules when the witch tries to save herself
  if (killAction.to === currentPlayer.username) {
    if (game.witchSaveSelf === GAME_WITCH_SAVE_SELF.NO_SAVE_SELF) {
      ctx.body = Result.fail(-1, '当前规则下女巫不能自救')
      return
    }
    if (game.witchSaveSelf === GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT && game.day > 1) {
      ctx.body = Result.fail(-1, '女巫仅能在第一夜自救')
      return
    }
  }
  const existAction = await Action.findOne({ gameId: String(gameId), roomId: game.roomId, day: game.day, stage: GAME_STAGE.WITCH_STAGE, action: { $in: [SKILL_ACTION_KEY.ANTIDOTE, SKILL_ACTION_KEY.POISON] } })
  if (existAction) {
    ctx.body = Result.fail(-1, '您已使用过该技能')
    return
  }
  if (!await saveActionOrFail(ctx, game, SKILL_ACTION_KEY.ANTIDOTE, currentPlayer.username, killAction.to, '您已使用过该技能')) return
  const diePlayer = await Player.findOne({ roomId, gameId: String(gameId), username: killAction.to })
  await recordService.actionRecord(game, currentPlayer, diePlayer, SKILL_ACTION_KEY.ANTIDOTE)
  await playerService.modifyPlayerSkill(currentPlayer, SKILL_ACTION_KEY.ANTIDOTE, SKILL_STATUS.UNAVAILABLE)
  ctx.body = Result.success('ok')
}

export async function votePlayer(ctx) {
  const { roomId, gameId, username } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId) || isEmpty(username)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.VOTE_STAGE && game.stage !== GAME_STAGE.VOTE_PK_STAGE) {
    ctx.body = Result.fail(-1, '该阶段不能进行投票操作')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer || currentPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, currentPlayer ? '您已出局，无法投票' : '未查询到你在该游戏中')
    return
  }
  // PK Candidates are disqualified from voting
  if (game.stage === GAME_STAGE.VOTE_PK_STAGE && game.pkCandidates?.includes(currentPlayer.username)) {
    ctx.body = Result.fail(-1, '您是PK候选人，此轮无权投票')
    return
  }
  // PK stage: only candidates can be voted for
  if (game.stage === GAME_STAGE.VOTE_PK_STAGE && game.pkCandidates?.length > 0) {
    if (!game.pkCandidates.includes(username)) {
      ctx.body = Result.fail(-1, 'PK阶段只能投票PK候选人')
      return
    }
  }
  const stage = game.stage
  const exist = await Action.findOne({ roomId, gameId: String(gameId), from: currentUser.username, day: game.day, stage, action: SKILL_ACTION_KEY.VOTE })
  if (exist) {
    ctx.body = Result.fail(-1, '今天你已使用过投票功能')
    return
  }
  const targetPlayer = await Player.findOne({ roomId, gameId: String(gameId), username })
  if (!targetPlayer) {
    ctx.body = Result.fail(-1, '目标玩家不存在')
    return
  }
  if (targetPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '该玩家已出局')
    return
  }
  if (targetPlayer.username === currentPlayer.username) {
    ctx.body = Result.fail(-1, '不能投票给自己')
    return
  }
  if (!await saveActionOrFail(ctx, game, SKILL_ACTION_KEY.VOTE, currentPlayer.username, targetPlayer.username, '今天你已使用过投票功能')) return
  ctx.body = Result.success({ username: targetPlayer.username, name: targetPlayer.name, position: targetPlayer.position })
}

export async function poisonPlayer(ctx) {
  const { roomId, gameId, username } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId) || isEmpty(username)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.WITCH_STAGE) {
    ctx.body = Result.fail(-1, '该阶段不能进行毒药操作')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer || currentPlayer.role !== GAME_ROLE.WITCH) {
    ctx.body = Result.fail(-1, '您在游戏中的角色不是女巫，无法使用该技能')
    return
  }
  if (currentPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '您已出局，无法再使用该技能')
    return
  }
  const poisonSkill = (currentPlayer.skill || []).find((s) => s.key === SKILL_ACTION_KEY.POISON)
  if (!poisonSkill || poisonSkill.status === SKILL_STATUS.UNAVAILABLE) {
    ctx.body = Result.fail(-1, '您已使用过毒药，无法再次使用')
    return
  }
  const exist = await Action.findOne({ roomId, gameId: String(gameId), from: currentUser.username, day: game.day, stage: GAME_STAGE.WITCH_STAGE, action: { $in: [SKILL_ACTION_KEY.ANTIDOTE, SKILL_ACTION_KEY.POISON] } })
  if (exist) {
    ctx.body = Result.fail(-1, '今天你已使用过女巫技能')
    return
  }
  const targetPlayer = await Player.findOne({ roomId, gameId: String(gameId), username })
  if (!targetPlayer) {
    ctx.body = Result.fail(-1, '目标玩家不存在')
    return
  }
  if (targetPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '该玩家已出局')
    return
  }
  if (!await saveActionOrFail(ctx, game, SKILL_ACTION_KEY.POISON, currentPlayer.username, targetPlayer.username, '今天你已使用过女巫技能')) return
  await playerService.modifyPlayerSkill(currentPlayer, SKILL_ACTION_KEY.POISON, SKILL_STATUS.UNAVAILABLE)
  ctx.body = Result.success({ username: targetPlayer.username, name: targetPlayer.name, position: targetPlayer.position })
}

export async function shootPlayer(ctx) {
  const { roomId, gameId, username } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId) || isEmpty(username)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.AFTER_NIGHT && game.stage !== GAME_STAGE.EXILE_FINISH_STAGE) {
    ctx.body = Result.fail(-1, '该阶段不能进行开枪操作')
    return
  }
  const currentUser = ctx.userInfo
  const exist = await Action.findOne({ roomId, gameId: String(gameId), from: currentUser.username, day: game.day, stage: { $in: [GAME_STAGE.AFTER_NIGHT, GAME_STAGE.EXILE_FINISH_STAGE] }, action: SKILL_ACTION_KEY.SHOOT })
  if (exist) {
    ctx.body = Result.fail(-1, '今天你已使用过开枪功能')
    return
  }
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer || currentPlayer.role !== GAME_ROLE.HUNTER) {
    ctx.body = Result.fail(-1, '您在游戏中的角色不是猎人，无法使用该技能')
    return
  }
  if (currentPlayer.outReason === GAME_OUT_REASON.POISON) {
    ctx.body = Result.fail(-1, '被毒死的猎人无法开枪')
    return
  }
  if (currentPlayer.status !== PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '猎人未出局，当前不能开枪')
    return
  }
  const shootSkill = (currentPlayer.skill || []).find((s) => s.key === SKILL_ACTION_KEY.SHOOT)
  if (!shootSkill || shootSkill.status !== SKILL_STATUS.AVAILABLE) {
    ctx.body = Result.fail(-1, '当前状态不能使用开枪技能')
    return
  }
  const targetPlayer = await Player.findOne({ roomId, gameId: String(gameId), username })
  if (!targetPlayer) {
    ctx.body = Result.fail(-1, '目标玩家不存在')
    return
  }
  if (targetPlayer.status === PLAYER_STATUS.DEAD) {
    ctx.body = Result.fail(-1, '该玩家已出局')
    return
  }
  if (targetPlayer.username === currentPlayer.username) {
    ctx.body = Result.fail(-1, '不能开枪带走自己')
    return
  }
  if (!await saveActionOrFail(ctx, game, SKILL_ACTION_KEY.SHOOT, currentPlayer.username, targetPlayer.username, '今天你已使用过开枪功能')) return
  await recordService.actionRecord(game, currentPlayer, targetPlayer, SKILL_ACTION_KEY.SHOOT)
  await tagService.deadTag(game, targetPlayer, GAME_OUT_REASON.SHOOT)
  await recordService.deadRecord(game, targetPlayer)
  await Player.findByIdAndUpdate(targetPlayer._id, { status: PLAYER_STATUS.DEAD, outReason: GAME_OUT_REASON.SHOOT })
  await playerService.modifyPlayerSkill(currentPlayer, SKILL_ACTION_KEY.SHOOT, SKILL_STATUS.UNAVAILABLE)

  // Add target to last-words queue if context warrants it; otherwise check game over immediately
  if (game.stage === GAME_STAGE.EXILE_FINISH_STAGE || (game.stage === GAME_STAGE.AFTER_NIGHT && game.day === 1)) {
    const currentLastWordPlayers = game.lastWordPlayers || []
    await Game.findByIdAndUpdate(game._id, {
      lastWordPlayers: [...currentLastWordPlayers, targetPlayer.position]
    })
  } else {
    await gameService.settleGameOver(String(game._id))
  }

  io?.to('room:' + game.roomId).emit('refreshGame')
  ctx.body = Result.success({ username: targetPlayer.username, name: targetPlayer.name, position: targetPlayer.position })
}

export async function nextLastWordSpeaker(ctx) {
  const { roomId, gameId } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status !== GAME_STATUS.GOING) {
    ctx.body = Result.fail(-1, '游戏不存在或已结束')
    return
  }
  if (game.stage !== GAME_STAGE.EXILE_FINISH_STAGE) {
    ctx.body = Result.fail(-1, '当前不是遗言阶段')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ gameId: String(gameId), username: currentUser.username })
  const room = await Room.findById(roomId)
  const isCurrentSpeaker = currentPlayer && currentPlayer.position === game.currentLastWordPosition
  const isOwner = room && (room.owner === currentUser.username || currentUser.role === 'admin')
  if (!isCurrentSpeaker && !isOwner) {
    ctx.body = Result.fail(-1, '无权操作')
    return
  }
  const timerId = timers.get(String(gameId))
  if (timerId) {
    clearInterval(timerId)
    timers.delete(String(gameId))
  }
  cache.set('game-time-' + gameId, 0)
  await gameService.advanceLastWordSpeaker(gameId)
  ctx.body = Result.success()
}

export async function gameResult(ctx) {
  const { id } = ctx.query
  if (isEmpty(id)) {
    ctx.body = Result.fail(-1, 'gameId不能为空')
    return
  }
  const game = await Game.findById(id)
  if (!game) {
    ctx.body = Result.fail(-1, '游戏不存在')
    return
  }
  if (game.status !== GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, '游戏还在进行中或游戏异常')
    return
  }
  ctx.body = Result.success({ winner: game.winner, winnerString: game.winnerString })
}

export async function gameDestroy(ctx) {
  const { roomId, gameId } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game) {
    ctx.body = Result.fail(-1, '游戏不存在')
    return
  }
  const room = await Room.findById(game.roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (room.owner !== ctx.userInfo.username && ctx.userInfo.role !== 'admin') {
    ctx.body = Result.fail(-1, '只有房主角色才能结束游戏')
    return
  }
  await Game.findByIdAndUpdate(gameId, { status: GAME_STATUS.EXCEPTION })
  await recordService.gameOverRecord(game)

  const timerId = timers.get(String(gameId))
  if (timerId) {
    cache.set('game-time-' + gameId, -1)
    clearInterval(timerId)
    timers.delete(String(gameId))
  }

  await Room.findByIdAndUpdate(game.roomId, { status: ROOM_STATUS.READY, gameId: null })
  io?.to('room:' + game.roomId).emit('reStart')
  ctx.body = Result.success('ok')
}

export async function gameAgain(ctx) {
  const { roomId } = ctx.request.body
  if (isEmpty(roomId)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (room.owner !== ctx.userInfo.username && ctx.userInfo.role !== 'admin') {
    ctx.body = Result.fail(-1, '只有房主才能重新开始游戏')
    return
  }
  await Room.findByIdAndUpdate(roomId, { status: ROOM_STATUS.READY, gameId: null })
  io?.to('room:' + roomId).emit('reStart')
  ctx.body = Result.success('ok')
}

export const getGameInfo = gameInfo

export async function obGame(ctx) {
  ctx.body = Result.fail(-1, '当前版本不支持观战')
}

export async function gameSettings(ctx) {
  const { mode } = ctx.query
  if (isEmpty(mode)) {
    ctx.body = Result.fail(-1, '游戏板子不能为空')
    return
  }
  if (!ALLOWED_GAME_MODES.includes(mode)) {
    ctx.body = Result.fail(-1, '不支持的游戏模式')
    return
  }
  const config = MODE[mode]
  ctx.body = Result.success({ settings: config.CONFIG_SETTINGS, options: config.CONFIG_OPTIONS, config: config.CONFIG_DEFAULT })
}

export async function gameRecent(ctx) {
  const username = ctx.userInfo.username
  const game = await gameService.getGameByUsername(username)
  if (!game) {
    ctx.body = Result.success(null)
    return
  }
  const room = await Room.findById(game.roomId)
  if (!room) {
    ctx.body = Result.success(null)
    return
  }
  ctx.body = Result.success({
    roomId: room._id,
    roomName: room.name,
    hasPassword: !!room.password,
    mode: game.mode,
    modeName: MODE[game.mode]?.name || '已停用模式',
    gameStatus: game.status
  })
}

export async function nextSpeaker(ctx) {
  const { roomId, gameId } = ctx.request.body
  if (isEmpty(roomId) || isEmpty(gameId)) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game || game.status === GAME_STATUS.FINISHED) {
    ctx.body = Result.fail(-1, game ? '游戏已结束' : '游戏不存在')
    return
  }
  if (game.stage !== GAME_STAGE.SPEAK_STAGE) {
    ctx.body = Result.fail(-1, '当前不是发言阶段')
    return
  }
  const room = await Room.findById(game.roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (String(room._id) !== String(roomId)) {
    ctx.body = Result.fail(-1, '房间与游戏不匹配')
    return
  }
  const currentUser = ctx.userInfo
  const isManager = room.owner === currentUser.username || currentUser.role === 'admin'
  const currentPlayer = await Player.findOne({ roomId: game.roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer && !isManager) {
    ctx.body = Result.fail(-1, '未查询到你在该游戏中')
    return
  }
  // Only the current speaker (to end their own turn) or room owner can advance
  if (!isManager && currentPlayer.position !== game.currentSpeakerPosition) {
    ctx.body = Result.fail(-1, '还未轮到你发言')
    return
  }

  // Stop the timer first, then delegate to shared autoAdvanceSpeaker logic
  const timerId = timers.get(String(gameId))
  if (timerId) {
    cache.set('game-time-' + gameId, -1)
    clearInterval(timerId)
    timers.delete(String(gameId))
  }

  await gameService.autoAdvanceSpeaker(gameId)
  ctx.body = Result.success('ok')
}

export async function restartGame(ctx) {
  const { roomId } = ctx.request.body
  if (isEmpty(roomId)) {
    ctx.body = Result.fail(-1, 'roomId不能为空')
    return
  }
  const room = await Room.findById(roomId)
  if (!room) {
    ctx.body = Result.fail(-1, '房间不存在')
    return
  }
  if (room.owner !== ctx.userInfo.username && ctx.userInfo.role !== 'admin') {
    ctx.body = Result.fail(-1, '只有房主才能重开游戏')
    return
  }

  // Stop any running timer
  if (room.gameId) {
    const timerId = timers.get(String(room.gameId))
    if (timerId) {
      cache.set('game-time-' + room.gameId, -1)
      clearInterval(timerId)
      timers.delete(String(room.gameId))
    }
    // Mark old game as exception
    await Game.findByIdAndUpdate(room.gameId, { status: GAME_STATUS.EXCEPTION })
  }

  // Preserve non-timer config from old game; timers come from room settings
  let configData = {}
  if (room.gameId) {
    const oldGame = await Game.findById(room.gameId)
    if (oldGame) {
      configData = {
        witchSaveSelf: oldGame.witchSaveSelf,
        winCondition: oldGame.winCondition,
        flatTicket: oldGame.flatTicket,
      }
    }
  }

  const game = await gameService.createNewGame(roomId, buildGameConfig(room, configData))
  await Room.findByIdAndUpdate(roomId, { status: ROOM_STATUS.GOING, gameId: String(game._id) })

  io?.to('room:' + roomId).emit('reStart')
  io?.to('room:' + roomId).emit('gameStart')
  await gameService.startStageTimer(String(game._id), game)

  ctx.body = Result.success({ gameId: String(game._id) })
}

export async function getChatHistory(ctx) {
  const { roomId, gameId } = ctx.query
  if (!roomId || !gameId) {
    ctx.body = Result.fail(-1, '参数不能为空')
    return
  }
  const game = await Game.findById(gameId)
  if (!game) {
    ctx.body = Result.fail(-1, '游戏不存在')
    return
  }
  const currentUser = ctx.userInfo
  const currentPlayer = await Player.findOne({ roomId, gameId: String(gameId), username: currentUser.username })
  if (!currentPlayer) {
    ctx.body = Result.fail(-1, '未查询到你在该游戏中')
    return
  }

  // Base query: public messages are always visible
  const conditions = [
    { roomId, gameId: String(gameId), channel: 'public' }
  ]

  // Alive wolves can see Wolf channel messages
  if (currentPlayer.role === GAME_ROLE.WOLF && currentPlayer.status === PLAYER_STATUS.ALIVE) {
    conditions.push({ roomId, gameId: String(gameId), channel: 'wolf' })
  }

  // Dead players can see ghost channel messages (unless they are still speaking or waiting to speak last words)
  if (currentPlayer.status === PLAYER_STATUS.DEAD) {
    const lastWordPlayers = game.lastWordPlayers || []
    const currentSpeakerIdx = lastWordPlayers.indexOf(game.currentLastWordPosition)
    const playerIdx = lastWordPlayers.indexOf(currentPlayer.position)
    const isSpeakingOrWaitingLastWords = game.stage === GAME_STAGE.EXILE_FINISH_STAGE
      && playerIdx !== -1
      && (currentSpeakerIdx === -1 || playerIdx >= currentSpeakerIdx)

    if (!isSpeakingOrWaitingLastWords) {
      conditions.push({ roomId, gameId: String(gameId), channel: 'ghost' })
    }
  }

  const messages = await ChatMessage.find({ $or: conditions }).sort({ createdAt: 1 })
  ctx.body = Result.success(messages)
}
