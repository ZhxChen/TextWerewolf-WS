import Router from 'koa-router'
import { login, register } from '../controllers/authController.js'

const router = new Router()
router.post('/login', login)
router.post('/register', register)
export default router
