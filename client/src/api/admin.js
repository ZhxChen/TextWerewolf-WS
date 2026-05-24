import request from './request'

export const createUser = (data) => request.post('/admin/users', data)
export const batchCreateUsers = (data) => request.post('/admin/users/batch', data)
export const deleteUser = (id) => request.delete(`/admin/users/${id}`)
export const getUsers = (params) => request.get('/admin/users', { params })
export const updateUserRole = (id, data) => request.put(`/admin/users/${id}/role`, data)
export const updateUserPassword = (id, data) => request.put(`/admin/users/${id}/password`, data)
export const updateUserStatus = (id, data) => request.put(`/admin/users/${id}/status`, data)
export const kickUser = (id) => request.post(`/admin/users/${id}/kick`)
export const getSystemConfig = () => request.get('/admin/config')
export const updateSystemConfig = (data) => request.put('/admin/config', data)
export const adminDeleteRoom = (id) => request.delete(`/admin/rooms/${id}`)
export const adminCloseRoom = (id) => request.post(`/admin/rooms/${id}/close`)
