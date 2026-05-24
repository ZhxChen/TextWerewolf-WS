import Router from 'koa-router'
import { auth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import * as authCtrl from '../controllers/authController.js'
import * as roomCtrl from '../controllers/roomController.js'
import * as gameCtrl from '../controllers/gameController.js'

const router = new Router()

const loginLimit = rateLimit({ windowMs: 60_000, max: 10, message: '登录尝试过于频繁，请 1 分钟后再试' })
const registerLimit = rateLimit({ windowMs: 3600_000, max: 5, message: '注册过于频繁，请 1 小时后再试' })

// Auth
router.post('/api/auth/login', loginLimit, authCtrl.login)
router.post('/api/auth/register', registerLimit, authCtrl.register)
router.get('/api/auth/registration-status', authCtrl.getRegistrationStatus)
router.put('/api/auth/password', auth, authCtrl.changePassword)
router.put('/api/auth/profile', auth, authCtrl.updateProfile)
router.post('/api/auth/logout', auth, authCtrl.logout)

// Room
router.get('/api/room/list/auth', auth, roomCtrl.roomList)
router.post('/api/room/create/auth', auth, roomCtrl.createRoom)
router.get('/api/room/info/auth', auth, roomCtrl.roomInfo)
router.post('/api/room/join/auth', auth, roomCtrl.joinRoom)
router.post('/api/room/quit/auth', auth, roomCtrl.quitRoom)
router.post('/api/room/verify-password/auth', auth, roomCtrl.verifyRoomPassword)
router.get('/api/room/recent/auth', auth, roomCtrl.recentRoom)
router.delete('/api/room/delete/auth', auth, roomCtrl.deleteRoom)

// Game - read-only
router.get('/api/game/info/auth', auth, gameCtrl.getGameInfo)
router.get('/api/game/result/auth', auth, gameCtrl.gameResult)
router.get('/api/game/record/auth', auth, gameCtrl.commonGameRecord)
router.get('/api/game/settings/auth', auth, gameCtrl.gameSettings)
router.get('/api/game/recent/auth', auth, gameCtrl.gameRecent)
router.get('/api/game/chatHistory/auth', auth, gameCtrl.getChatHistory)

// Game - state-mutating (POST)
router.post('/api/game/start/auth', auth, gameCtrl.gameStart)
router.post('/api/game/nextStage/auth', auth, gameCtrl.nextStage)
router.post('/api/game/nextSpeaker/auth', auth, gameCtrl.nextSpeaker)
router.post('/api/game/nextLastWordSpeaker/auth', auth, gameCtrl.nextLastWordSpeaker)
router.post('/api/game/restart/auth', auth, gameCtrl.restartGame)
router.post('/api/game/destroy/auth', auth, gameCtrl.gameDestroy)
router.post('/api/game/again/auth', auth, gameCtrl.gameAgain)
router.post('/api/game/ob/auth', auth, gameCtrl.obGame)
router.post('/api/game/checkPlayer/auth', auth, gameCtrl.checkPlayer)
router.post('/api/game/assaultPlayer/auth', auth, gameCtrl.assaultPlayer)
router.post('/api/game/antidotePlayer/auth', auth, gameCtrl.antidotePlayer)
router.post('/api/game/votePlayer/auth', auth, gameCtrl.votePlayer)
router.post('/api/game/poisonPlayer/auth', auth, gameCtrl.poisonPlayer)
router.post('/api/game/shootPlayer/auth', auth, gameCtrl.shootPlayer)

export default router
