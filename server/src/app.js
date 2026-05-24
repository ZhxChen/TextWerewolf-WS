import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import serve from 'koa-static'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import config from './config/index.js'
import apiRoutes from './routes/index.js'
import adminRoutes from './routes/admin.js'
import { errorHandler } from './middleware/errorHandler.js'
import logger from './utils/logger.js'
import { io, timers, cache, setIo } from './state.js'
import { createSocketServer } from './websocket/index.js'
import { startRoomCleanup } from './services/roomCleanup.js'
import { recoverActiveGames } from './services/gameService.js'
import User from './models/User.js'
import { createPassword } from './utils/helper.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = resolve(__dirname, '../../client/dist')

const app = new Koa()
const httpServer = createServer(app.callback())
const ioInstance = createSocketServer(httpServer)

setIo(ioInstance)

app.use(cors({ origin: config.cors.origin, allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))
app.use(koaBody())
app.use(errorHandler)
app.use(apiRoutes.routes())
app.use(apiRoutes.allowedMethods())
app.use(adminRoutes.routes())
app.use(adminRoutes.allowedMethods())

if (config.serveStatic !== false) {
  app.use(serve(clientDist))
  app.use(async (ctx) => {
    if (ctx.method === 'GET' && !ctx.path.startsWith('/api') && !ctx.path.startsWith('/socket.io')) {
      ctx.type = 'html'
      const { createReadStream } = await import('fs')
      ctx.body = createReadStream(resolve(clientDist, 'index.html'))
    }
  })
}

async function start() {
  try {
    await mongoose.connect(config.mongodb.uri)
    logger.info('MongoDB connected')

    const adminExists = await User.findOne({ username: 'admin' })
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: await createPassword('123456'),
        name: '管理员',
        role: 'admin'
      })
      logger.info('Default admin account created (admin / 123456)')
    }
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed')
    process.exit(1)
  }

  httpServer.listen(config.port, async () => {
    logger.info(`Server started on port ${config.port}`)
    startRoomCleanup()
    // Restore timers for any games that were in progress when the server last restarted
    await recoverActiveGames()
  })

  // Silently discard broken-pipe / reset errors from clients that close early
  httpServer.on('clientError', (err, socket) => {
    if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
      socket.destroy()
      return
    }
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  })
}

start()

function getIo() {
  return io
}

function getTimers() {
  return timers
}

function getCache() {
  return cache
}

export { getIo, getTimers, getCache }
export default app
