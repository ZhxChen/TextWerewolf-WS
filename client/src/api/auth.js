import request from './request'

export const login = (data) => request.post('/auth/login', data)
export const register = (data) => request.post('/auth/register', data)
export const getRegistrationStatus = () => request.get('/auth/registration-status')
export const changePassword = (data) => request.put('/auth/password', data)
export const updateProfile = (data) => request.put('/auth/profile', data)
