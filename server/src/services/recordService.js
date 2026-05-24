import { Record, Player } from '../models/index.js'
import { SKILL_ACTION_KEY, TEXT_COLOR, GAME_CAMP, GAME_ROLE, SKILL_MAP, SKILL_STATUS, JUMP_MAP, CAMP_MAP } from '../config/constants.js'
import { getPlayerFullName, getRoleName, mapToArray } from '../utils/helper.js'

function base(gameInstance, extra = {}) {
  return {
    roomId: gameInstance.roomId,
    gameId: String(gameInstance._id),
    day: gameInstance.day,
    stage: gameInstance.stage,
    ...extra
  }
}

export async function gameStartRecord(gameInstance) {
  await Record.create({
    ...base(gameInstance, { day: undefined, stage: undefined }),
    roomId: gameInstance.roomId,
    gameId: String(gameInstance._id),
    isCommon: 1,
    isTitle: 0,
    content: { text: '游戏开始！', type: 'text', level: TEXT_COLOR.RED }
  })
}

export async function gameOverRecord(gameInstance) {
  await Record.create({
    roomId: gameInstance.roomId,
    gameId: String(gameInstance._id),
    isCommon: 1,
    isTitle: 0,
    content: '房主结束了该场游戏，游戏已结束！'
  })
}

export async function nightBeginRecord(gameInstance, day, stage) {
  const rec = {
    roomId: gameInstance.roomId,
    gameId: String(gameInstance._id),
    isCommon: 1,
    content: { text: '天黑请闭眼', type: 'text', level: TEXT_COLOR.BLACK }
  }
  if (day !== undefined) rec.day = day
  if (stage !== undefined) rec.stage = stage
  await Record.create(rec)
}

export async function dayBeginRecord(gameInstance) {
  await Record.create({
    ...base(gameInstance),
    isCommon: 1,
    isTitle: 0,
    content: { text: '天亮了！', type: 'text', level: TEXT_COLOR.BLUE }
  })
}

export async function peaceRecord(gameInstance) {
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: { type: 'text', text: '昨天晚上是平安夜!', level: TEXT_COLOR.GREEN }
  })
}

export async function actionRecord(gameInstance, fromPlayer, toPlayer, actionKey) {
  const skillList = SKILL_MAP[fromPlayer.role] || []
  const action = skillList.find((item) => item.key === actionKey)
  const actionName = action?.name
  let targetText = ''
  let textLevel = TEXT_COLOR.BLACK
  let isCommon = 0

  switch (actionKey) {
    case SKILL_ACTION_KEY.CHECK:
      targetText = getPlayerFullName(fromPlayer) + fromPlayer.roleName + '查验了' + getPlayerFullName(toPlayer) + '的身份为' + toPlayer.campName
      textLevel = TEXT_COLOR.GREEN
      break
    case SKILL_ACTION_KEY.POISON:
      targetText = getPlayerFullName(fromPlayer) + fromPlayer.roleName + '使用毒药毒死了' + getPlayerFullName(toPlayer)
      textLevel = TEXT_COLOR.PINK
      break
    case SKILL_ACTION_KEY.ANTIDOTE:
      targetText = getPlayerFullName(fromPlayer) + fromPlayer.roleName + '使用解药救下了' + getPlayerFullName(toPlayer)
      textLevel = TEXT_COLOR.GREEN
      break
    case SKILL_ACTION_KEY.SHOOT:
      targetText = getPlayerFullName(fromPlayer) + fromPlayer.roleName + '发动开枪带走了' + getPlayerFullName(toPlayer)
      textLevel = TEXT_COLOR.ORANGE
      isCommon = 1
      break
    default:
  }

  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon,
    isTitle: 0,
    content: {
      type: 'action',
      text: targetText,
      key: actionKey,
      actionName,
      level: textLevel,
      from: { username: fromPlayer.username, name: fromPlayer.name, position: fromPlayer.position, role: fromPlayer.role, camp: fromPlayer.camp },
      to: { username: toPlayer.username, name: toPlayer.name, position: toPlayer.position, role: toPlayer.role, camp: toPlayer.camp }
    }
  })
}

export async function deadRecord(gameInstance, targetPlayer) {
  const from = targetPlayer
    ? { username: targetPlayer.username, name: targetPlayer.name, position: targetPlayer.position, role: targetPlayer.role, camp: targetPlayer.camp }
    : { username: null, name: null, position: null, role: null, camp: null }
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'action',
      action: SKILL_ACTION_KEY.DIE,
      actionName: '死亡',
      level: TEXT_COLOR.RED,
      from,
      to: { role: 'out', name: '出局' }
    }
  })
}

export async function gameWinRecord(gameInstance, camp) {
  const campList = mapToArray(CAMP_MAP)
  const target = campList.find((item) => item.value === camp)
  let color
  switch (camp) {
    case 0:
      color = TEXT_COLOR.RED
      break
    case 1:
      color = TEXT_COLOR.GREEN
      break
    case 2:
      color = TEXT_COLOR.PINK
      break
    default:
      color = TEXT_COLOR.BLACK
  }
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'rich-text',
      content: [
        { text: '游戏结束！', level: TEXT_COLOR.BLACK },
        { text: target?.name || '', level: color },
        { text: '赢得', level: TEXT_COLOR.BLACK },
        { text: '胜利！', level: TEXT_COLOR.GREEN }
      ]
    }
  })
}

export async function emptyActionRecord(gameInstance, fromPlayer) {
  const roleName = getRoleName(fromPlayer.role)
  let actionName = JUMP_MAP[fromPlayer.role] || '空过'
  if (fromPlayer.role === GAME_ROLE.WITCH) {
    const has = (fromPlayer.skill || []).some((item) => item.status === SKILL_STATUS.AVAILABLE)
    if (!has) actionName = actionName + '（药已用完）'
  }
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 0,
    isTitle: 0,
    content: {
      type: 'action',
      key: SKILL_ACTION_KEY.JUMP,
      text: getPlayerFullName(fromPlayer) + `${roleName}${actionName}`,
      actionName,
      level: TEXT_COLOR.ORANGE,
      from: { username: fromPlayer.username, name: fromPlayer.name, position: fromPlayer.position, role: fromPlayer.role, camp: fromPlayer.camp, status: fromPlayer.status },
      to: { username: null, name: null }
    }
  })
}

export async function speakRecord(gameInstance, targetPlayer, randomOrder) {
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'rich-text',
      content: [
        { text: '进入投票环节，由', level: TEXT_COLOR.BLACK },
        { text: getPlayerFullName(targetPlayer), level: TEXT_COLOR.BLUE },
        { text: '开始发言。顺序为：', level: TEXT_COLOR.BLACK },
        { text: randomOrder === 1 ? '正向' : '逆向', level: randomOrder === 1 ? TEXT_COLOR.GREEN : TEXT_COLOR.RED }
      ]
    }
  })
}

export async function abstainedRecord(gameInstance, abstainedPlayer = null) {
  if (!abstainedPlayer) {
    await Record.create({
      ...base(gameInstance),
      view: [],
      isCommon: 1,
      isTitle: 0,
      content: { text: '所有人弃票，没有玩家出局', type: 'text', level: TEXT_COLOR.RED }
    })
    return
  }
  const abstainedString = abstainedPlayer.map((p, i) => (i > 0 ? '、' : '') + p.position + '号').join('')
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'action',
      actionName: '弃票',
      text: abstainedString + '弃票',
      action: 'abstained',
      level: TEXT_COLOR.PINK,
      from: { name: abstainedString },
      to: { name: '弃票', username: null }
    }
  })
}

export async function voteRecord(gameInstance, map, key) {
  let content = map[key]
  content = content.sort((a, b) => a.position - b.position)
  const toPlayer = await Player.findOne({ roomId: gameInstance.roomId, gameId: String(gameInstance._id), username: key })
  let votePlayerString = ''
  for (let i = 0; i < content.length; i += 1) {
    const fromPlayer = await Player.findOne({ roomId: gameInstance.roomId, gameId: String(gameInstance._id), username: content[i].username })
    if (i > 0) votePlayerString += '、'
    votePlayerString += fromPlayer.position + '号'
  }
  const voteResultString = votePlayerString + '投票给了' + toPlayer.position + '号玩家（' + toPlayer.name + ')'
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'action',
      actionName: '投票',
      text: voteResultString,
      action: SKILL_ACTION_KEY.VOTE,
      level: TEXT_COLOR.BLUE,
      from: { username: null, name: votePlayerString, position: null, role: null, camp: null },
      to: { username: toPlayer.username, name: '共' + content.length + '票', position: toPlayer.position, role: null, camp: null }
    }
  })
}

export async function exileRecord(gameInstance, targetPlayer) {
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'action',
      actionName: '放逐',
      action: 'exile',
      text: getPlayerFullName(targetPlayer) + '获得最高票数，被放逐出局！',
      level: TEXT_COLOR.RED,
      from: { name: targetPlayer.name, username: targetPlayer.username, position: targetPlayer.position, role: targetPlayer.role, camp: targetPlayer.camp },
      to: { role: 'exile', name: '放逐出局' }
    }
  })
}

export async function flatTicketRecord(gameInstance) {
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'rich-text',
      content: [
        { text: '平票', level: TEXT_COLOR.RED },
        { text: '，没有玩家出局', level: TEXT_COLOR.BLACK }
      ]
    }
  })
}

export async function votePkRecord(gameInstance, targetPlayer, maxCount, randomOrder) {
  let pkPlayerString = ''
  for (let i = 0; i < maxCount.length; i += 1) {
    const pkPlayer = await Player.findOne({ roomId: gameInstance.roomId, gameId: String(gameInstance._id), username: maxCount[i] })
    pkPlayerString += getPlayerFullName(pkPlayer)
    if (i < maxCount.length - 1) pkPlayerString += '、'
  }
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 1,
    isTitle: 0,
    content: {
      type: 'rich-text',
      content: [
        { text: '进入', level: TEXT_COLOR.BLACK },
        { text: '加赛pk', level: TEXT_COLOR.RED },
        { text: '环节，', level: TEXT_COLOR.BLACK },
        { text: pkPlayerString, level: TEXT_COLOR.GREEN },
        { text: '进行pk', level: TEXT_COLOR.RED },
        { text: '，由', level: TEXT_COLOR.BLACK },
        { text: getPlayerFullName(targetPlayer), level: TEXT_COLOR.BLUE },
        { text: '先开始发言。顺序为：', level: TEXT_COLOR.BLACK },
        { text: randomOrder === 1 ? '正向' : '逆向', level: randomOrder === 1 ? TEXT_COLOR.GREEN : TEXT_COLOR.RED }
      ]
    }
  })
}

export async function wolfTeamAssaultRecord(gameInstance, toPlayer) {
  await Record.create({
    ...base(gameInstance),
    view: [],
    isCommon: 0,
    isTitle: 0,
    content: {
      text: '狼人今晚袭击了：' + getPlayerFullName(toPlayer),
      type: 'action',
      key: SKILL_ACTION_KEY.KILL,
      actionName: '袭击',
      level: TEXT_COLOR.RED,
      from: { username: null, name: '狼人', position: null, role: GAME_ROLE.WOLF, camp: GAME_CAMP.WOLF },
      to: { username: toPlayer.username, name: toPlayer.name, position: toPlayer.position, role: toPlayer.role, camp: toPlayer.camp }
    }
  })
}

