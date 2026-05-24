import Router from 'koa-router'
import { auth } from '../middleware/auth.js'
import { gameStart, gameInfo, nextStage, nextSpeaker, commonGameRecord, checkPlayer, assaultPlayer, antidotePlayer, votePlayer, poisonPlayer, shootPlayer, gameResult, gameDestroy, gameAgain, obGame, gameSettings, gameRecent } from '../controllers/gameController.js'

const router = new Router()
router.post('/start/auth', auth, gameStart)
router.get('/info/auth', auth, gameInfo)
router.post('/nextStage/auth', auth, nextStage)
router.post('/nextSpeaker/auth', auth, nextSpeaker)
router.get('/record/auth', auth, commonGameRecord)
router.post('/checkPlayer/auth', auth, checkPlayer)
router.post('/assaultPlayer/auth', auth, assaultPlayer)
router.post('/antidotePlayer/auth', auth, antidotePlayer)
router.post('/votePlayer/auth', auth, votePlayer)
router.post('/poisonPlayer/auth', auth, poisonPlayer)
router.post('/shootPlayer/auth', auth, shootPlayer)
router.get('/result/auth', auth, gameResult)
router.post('/destroy/auth', auth, gameDestroy)
router.post('/again/auth', auth, gameAgain)
router.post('/ob/auth', auth, obGame)
router.get('/settings/auth', auth, gameSettings)
router.get('/recent/auth', auth, gameRecent)
export default router
