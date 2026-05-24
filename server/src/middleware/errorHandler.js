import logger from '../utils/logger.js'
import { Result } from '../utils/response.js'

export const errorHandler = async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    logger.error(err)
    const status = err.status || 500
    const message = status < 500 ? err.message : '服务器内部错误'
    ctx.status = status
    ctx.body = Result.error(status, message)
  }
}
