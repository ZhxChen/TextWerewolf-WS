import { GameTag } from '../models/index.js'
import { GAME_TAG_MODE } from '../config/constants.js'

export async function deadTag(gameInstance, player, reason) {
  return await GameTag.create({
    roomId: gameInstance.roomId,
    gameId: gameInstance._id,
    day: gameInstance.day,
    stage: gameInstance.stage,
    mode: GAME_TAG_MODE.DIE,
    data: { username: player.username, name: player.name, position: player.position, reason }
  })
}

export async function speakOrderTag(gameInstance, order) {
  return await GameTag.create({
    roomId: gameInstance.roomId,
    gameId: gameInstance._id,
    day: gameInstance.day,
    stage: gameInstance.stage,
    mode: GAME_TAG_MODE.SPEAK_ORDER,
    data: { order }
  })
}

export async function votePkTag(gameInstance, candidates) {
  return await GameTag.create({
    roomId: gameInstance.roomId,
    gameId: gameInstance._id,
    day: gameInstance.day,
    stage: gameInstance.stage,
    mode: GAME_TAG_MODE.VOTE_PK,
    data: { candidates }
  })
}
