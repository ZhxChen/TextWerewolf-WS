import request from './request'

export const getRoomList = () => request.get('/room/list/auth')
export const createRoom = (data) => request.post('/room/create/auth', data)
export const getRoomInfo = (params) => request.get('/room/info/auth', { params })
export const joinRoom = (data) => request.post('/room/join/auth', data)
export const quitRoom = (data) => request.post('/room/quit/auth', data)
export const getRecentRoom = () => request.get('/room/recent/auth')
export const verifyRoomPassword = (data) => request.post('/room/verify-password/auth', data)
export const deleteRoom = (params) => request.delete('/room/delete/auth', { params })
