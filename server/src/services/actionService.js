import { Action } from '../models/index.js'

export class ActionConflictError extends Error {
  constructor(message = '操作已提交，请勿重复提交') {
    super(message)
    this.name = 'ActionConflictError'
    this.isActionConflict = true
  }
}

export async function saveAction(gameInstance, action, from, to) {
  try {
    return await Action.create({
      roomId: gameInstance.roomId,
      gameId: gameInstance._id,
      day: gameInstance.day,
      stage: gameInstance.stage,
      from,
      to,
      action
    })
  } catch (error) {
    if (error?.code === 11000) {
      throw new ActionConflictError()
    }
    throw error
  }
}

export function isActionConflictError(error) {
  return !!error?.isActionConflict
}
