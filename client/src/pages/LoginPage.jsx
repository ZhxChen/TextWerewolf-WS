import { useState, useEffect } from 'react'
import { Card, Input, Button, Divider } from 'animal-island-ui'
import { useNavigate } from 'react-router-dom'
import { login, register, getRegistrationStatus } from '../api/auth'
import { useAuthStore } from '../stores/useAuthStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState(true)

  useEffect(() => {
    getRegistrationStatus()
      .then((data) => {
        if (data?.registrationOpen === false) {
          setRegistrationOpen(false)
          setMode('login')
        }
      })
      .catch(() => {/* ignore */})
  }, [])

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      const data = mode === 'login'
        ? await login({ username: form.username, password: form.password })
        : await register({ username: form.username, password: form.password, name: form.name })
      setAuth({ username: data.username, name: data.name, role: data.role }, data.token)
      navigate('/')
    } catch (e) {
      setError(e.errorMessage || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="page-header">
          <div className="page-title">🐺 狼人杀</div>
        </div>
        <Card>
          <div className="flex flex-col gap-12">
            {mode === 'register' && (
              <div>
                <div className="form-label">昵称</div>
                <Input
                  placeholder="你的游戏昵称"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  allowClear
                />
              </div>
            )}
            <div>
              <div className="form-label">用户名</div>
              <Input
                placeholder="请输入用户名"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                allowClear
              />
            </div>
            <div>
              <div className="form-label">密码</div>
              <Input
                type="password"
                placeholder="请输入密码"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            {error && (
              <div className="form-error" style={{ textAlign: 'center' }} role="alert">
                {error}
              </div>
            )}
            <Button type="primary" block loading={loading} onClick={handleSubmit}>
              {mode === 'login' ? '登 录' : '注 册'}
            </Button>
            <Divider />
            <Button
              type="text"
              block
              disabled={mode === 'login' && !registrationOpen}
              onClick={() => {
                if (!registrationOpen) return
                setMode((m) => (m === 'login' ? 'register' : 'login'))
                setError('')
              }}
            >
              {mode === 'login'
                ? (registrationOpen ? '还没有账号？去注册' : '注册已关闭')
                : '已有账号？去登录'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
