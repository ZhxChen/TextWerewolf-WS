import Router from 'koa-router'
import { auth } from '../middleware/auth.js'
import { roomList, createRoom, roomInfo, joinRoom, quitRoom, recentRoom } from '../controllers/roomController.js'

const router = new Router()
router.get('/list/auth', auth, roomList)
router.post('/create/auth', auth, createRoom)
router.get('/info/auth', auth, roomInfo)
router.get('/join/auth', auth, joinRoom)
router.get('/quit/auth', auth, quitRoom)
router.get('/recent/auth', auth, recentRoom)
export default router
