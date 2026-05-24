import axios from 'axios'
import { useAuthStore } from '../stores/useAuthStore'

const request = axios.create({
  baseURL: '/api',
  timeout: 15000
})

request.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = token
  }
  return config
})

request.interceptors.response.use(
  (res) => {
    // 处理服务端自动续签的新 token
    const newToken = res.headers['x-token-refresh']
    if (newToken) {
      useAuthStore.getState().setToken(newToken)
    }
    const data = res.data
    if (!data || typeof data !== 'object' || (!('success' in data) && !('code' in data) && !('errorCode' in data))) {
      return data
    }
    const code = data.code ?? data.errorCode ?? (data.success === false ? -1 : 0)
    const message = data.message || data.msg || data.errorMessage || '请求失败'
    const isSuccess = data.success === true || code === 0
    if (isSuccess) {
      return data.data
    }
    if (code === -3) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject({ errorCode: code, errorMessage: message })
  },
  (err) => Promise.reject({ errorCode: -1, errorMessage: err.message || '网络错误' })
)

export default request
