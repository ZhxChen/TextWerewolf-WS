import Router from 'koa-router'
import { auth, requireAdmin } from '../middleware/auth.js'
import * as adminCtrl from '../controllers/adminController.js'

const router = new Router()

router.post('/api/admin/users', auth, requireAdmin, adminCtrl.createUser)
router.post('/api/admin/users/batch', auth, requireAdmin, adminCtrl.batchCreateUsers)
router.delete('/api/admin/users/:id', auth, requireAdmin, adminCtrl.deleteUser)
router.get('/api/admin/users', auth, requireAdmin, adminCtrl.listUsers)
router.put('/api/admin/users/:id/role', auth, requireAdmin, adminCtrl.updateUserRole)
router.put('/api/admin/users/:id/password', auth, requireAdmin, adminCtrl.updateUserPassword)
router.put('/api/admin/users/:id/status', auth, requireAdmin, adminCtrl.updateUserStatus)
router.post('/api/admin/users/:id/kick', auth, requireAdmin, adminCtrl.kickUser)
router.get('/api/admin/config', auth, requireAdmin, adminCtrl.getSystemConfig)
router.put('/api/admin/config', auth, requireAdmin, adminCtrl.updateSystemConfig)
router.delete('/api/admin/rooms/:id', auth, requireAdmin, adminCtrl.adminDeleteRoom)
router.post('/api/admin/rooms/:id/close', auth, requireAdmin, adminCtrl.adminCloseRoom)

export default router
