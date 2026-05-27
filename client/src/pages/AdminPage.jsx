import { useState, useEffect, useCallback, useRef } from 'react'
import { Tabs, Card, Button, Input, Modal, Select, Switch, Divider } from 'animal-island-ui'
import { useNavigate } from 'react-router-dom'
import {
  getUsers, updateUserRole, updateUserPassword, updateUserStatus, kickUser, deleteUser,
  createUser, batchCreateUsers,
  getSystemConfig, updateSystemConfig, adminDeleteRoom, adminCloseRoom
} from '../api/admin'
import { getRoomList } from '../api/room'
import { useAuthStore } from '../stores/useAuthStore'
import { useToast } from '../components/Toast'

const ROLE_OPTIONS = [
  { key: 'admin', label: '管理员' },
  { key: 'user', label: '普通玩家' }
]

const ROOM_STATUS_TEXT = { 0: '等待中', 1: '游戏中', 2: '已关闭' }
const ROOM_STATUS_COLOR = { 0: 'app-yellow', 1: 'app-orange', 2: 'brown' }

// ─── 用户管理 Tab ────────────────────────────────────────────────
function UsersTab() {
  const { showToast } = useToast()
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [roleModal, setRoleModal] = useState(null)
  const [pwdModal, setPwdModal] = useState(null)
  const [newRole, setNewRole] = useState('user')
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Add account state
  const [addModal, setAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ username: '', password: '', name: '', role: 'user' })
  const [addError, setAddError] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Batch import state
  const fileInputRef = useRef(null)
  const [batchModal, setBatchModal] = useState(false)
  const [batchPhase, setBatchPhase] = useState(0) // 0: upload, 1: preview, 2: result
  const [batchRows, setBatchRows] = useState([])
  const [batchError, setBatchError] = useState('')
  const [batchResult, setBatchResult] = useState(null)
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getUsers()
      setUsers(data || [])
    } catch (e) {
      showToast(e.errorMessage || '获取用户列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), 0)
    return () => clearTimeout(timer)
  }, [fetchUsers])

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 1 ? 0 : 1
    try {
      await updateUserStatus(user._id, { status: newStatus })
      setUsers((prev) => prev.map((u) => u._id === user._id ? { ...u, status: newStatus } : u))
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    }
  }

  const handleKick = (user) => {
    setConfirmModal({
      title: '确认踢出用户',
      message: `确认踢出 ${user.name}（${user.username}）下线？`,
      okText: '踢下线',
      onOk: async () => {
        setConfirmSubmitting(true)
        try {
          await kickUser(user._id)
          setConfirmModal(null)
          showToast('已踢出下线', 'success')
        } catch (e) {
          showToast(e.errorMessage || '操作失败', 'error')
        } finally {
          setConfirmSubmitting(false)
        }
      }
    })
  }

  const handleDelete = (user) => {
    setConfirmModal({
      title: '确认删除账号',
      message: `确认删除账号 ${user.name}（${user.username}）？此操作不可撤销。`,
      okText: '删除账号',
      onOk: async () => {
        setConfirmSubmitting(true)
        try {
          await deleteUser(user._id)
          setUsers((prev) => prev.filter((u) => u._id !== user._id))
          setConfirmModal(null)
          showToast('账号已删除', 'success')
        } catch (e) {
          showToast(e.errorMessage || '操作失败', 'error')
        } finally {
          setConfirmSubmitting(false)
        }
      }
    })
  }

  const handleRoleSubmit = async () => {
    if (!roleModal) return
    setSubmitting(true)
    try {
      await updateUserRole(roleModal.user._id, { role: newRole })
      setUsers((prev) => prev.map((u) => u._id === roleModal.user._id ? { ...u, role: newRole } : u))
      setRoleModal(null)
      showToast('角色已修改', 'success')
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePwdSubmit = async () => {
    if (!pwdModal || !newPassword) return
    setSubmitting(true)
    try {
      await updateUserPassword(pwdModal.user._id, { password: newPassword })
      setPwdModal(null)
      setNewPassword('')
      showToast('密码已修改', 'success')
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddSubmit = async () => {
    const { username, password, name, role } = addForm
    if (!username.trim() || !password.trim() || !name.trim()) {
      setAddError('用户名、密码、昵称不能为空')
      return
    }
    if (name.trim().length < 2 || name.trim().length > 12) {
      setAddError('昵称需 2-12 个字符')
      return
    }
    setAddSubmitting(true)
    setAddError('')
    try {
      await createUser({ username: username.trim(), password: password.trim(), name: name.trim(), role })
      setAddModal(false)
      fetchUsers()
      showToast('添加成功', 'success')
    } catch (e) {
      setAddError(e.errorMessage || '添加失败')
    } finally {
      setAddSubmitting(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBatchError('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      const lines = evt.target.result.split('\n').filter((l) => l.trim())
      if (lines.length > 50) {
        setBatchError('超过 50 条限制，请减少后重新上传')
        e.target.value = ''
        return
      }
      const rows = lines.map((line) => {
        const parts = line.split(',').map((s) => s.trim())
        const role = ['admin', 'user'].includes(parts[3]) ? parts[3] : 'user'
        return { username: parts[0] || '', password: parts[1] || '', name: parts[2] || '', role }
      })
      setBatchRows(rows)
      setBatchPhase(1)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  const handleBatchSubmit = async () => {
    setBatchSubmitting(true)
    setBatchError('')
    try {
      const result = await batchCreateUsers({ users: batchRows })
      setBatchResult(result)
      setBatchPhase(2)
    } catch (e) {
      setBatchError(e.errorMessage || '导入失败')
    } finally {
      setBatchSubmitting(false)
    }
  }

  const handleBatchClose = () => {
    setBatchModal(false)
    if (batchPhase === 2) fetchUsers()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span style={{ color: '#725d42', fontWeight: 600 }}>共 {users.length} 个账号</span>
        <div className="flex gap-8">
          <Button
            size="small"
            type="primary"
            onClick={() => { setAddForm({ username: '', password: '', name: '', role: 'user' }); setAddError(''); setAddModal(true) }}
          >
            + 添加账号
          </Button>
          <Button
            size="small"
            onClick={() => { setBatchPhase(0); setBatchRows([]); setBatchError(''); setBatchResult(null); setBatchModal(true) }}
          >
            📥 批量导入
          </Button>
          <Button size="small" onClick={fetchUsers} loading={loading}>刷新</Button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((u) => (
          <Card key={u._id} color={u.status === 0 ? 'brown' : u.role === 'admin' ? 'purple' : 'default'}>
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                <span style={{ opacity: 0.6, marginLeft: 8, fontSize: '0.85rem' }}>@{u.username}</span>
                <span className={u.role === 'admin' ? 'badge-admin' : 'badge-player'} style={{ marginLeft: 8 }}>
                  {u.role === 'admin' ? '管理员' : '玩家'}
                </span>
                {u.status === 0 && (
                  <span className="badge-disabled" style={{ marginLeft: 6 }}>已禁用</span>
                )}
              </div>
              <div className="flex gap-8 items-center" style={{ flexWrap: 'wrap' }}>
                <Switch
                  checked={u.status === 1}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                  disabled={u._id === currentUser?._id}
                  onChange={() => handleToggleStatus(u)}
                />
                <Button size="small" onClick={() => { setNewRole(u.role); setRoleModal({ user: u }) }}>
                  改角色
                </Button>
                <Button size="small" onClick={() => { setNewPassword(''); setPwdModal({ user: u }) }}>
                  改密码
                </Button>
                <Button size="small" danger onClick={() => handleKick(u)}>
                  踢下线
                </Button>
                <Button
                  size="small"
                  danger
                  disabled={u._id === currentUser?._id}
                  onClick={() => handleDelete(u)}
                >
                  删除
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!confirmModal}
        title={confirmModal?.title || '确认操作'}
        onClose={() => !confirmSubmitting && setConfirmModal(null)}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setConfirmModal(null)} disabled={confirmSubmitting}>取消</Button>
            <Button type="primary" danger loading={confirmSubmitting} onClick={confirmModal?.onOk}>
              {confirmModal?.okText || '确认'}
            </Button>
          </>
        )}
      >
        <div className="confirm-modal-message">{confirmModal?.message}</div>
      </Modal>

      {/* 修改角色 Modal */}
      <Modal
        open={!!roleModal}
        title={`修改角色 — ${roleModal?.user?.name}`}
        onClose={() => setRoleModal(null)}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setRoleModal(null)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleRoleSubmit}>确认</Button>
          </>
        )}
      >
        <div style={{ padding: '8px 0' }}>
          <div className="form-label" style={{ marginBottom: 8 }}>新角色</div>
          <Select
            value={newRole}
            onChange={setNewRole}
            options={ROLE_OPTIONS}
          />
        </div>
      </Modal>

      {/* 修改密码 Modal */}
      <Modal
        open={!!pwdModal}
        title={`修改密码 — ${pwdModal?.user?.name}`}
        onClose={() => setPwdModal(null)}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setPwdModal(null)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handlePwdSubmit}>确认</Button>
          </>
        )}
      >
        <div style={{ padding: '8px 0' }}>
          <div className="form-label" style={{ marginBottom: 8 }}>新密码</div>
          <Input
            type="password"
            placeholder="请输入新密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            allowClear
          />
        </div>
      </Modal>

      {/* 添加账号 Modal */}
      <Modal
        open={addModal}
        title="添加账号"
        onClose={() => setAddModal(false)}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setAddModal(false)}>取消</Button>
            <Button type="primary" loading={addSubmitting} onClick={handleAddSubmit}>添加</Button>
          </>
        )}
      >
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="form-label">用户名 *</div>
            <Input
              placeholder="登录账号（唯一）"
              value={addForm.username}
              onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
              allowClear
            />
          </div>
          <div>
            <div className="form-label">密码 *</div>
            <Input
              type="password"
              placeholder="请输入密码"
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              allowClear
            />
          </div>
          <div>
            <div className="form-label">昵称 *（2-12 字符）</div>
            <Input
              placeholder="显示名称"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              allowClear
            />
          </div>
          <div>
            <div className="form-label">角色</div>
            <Select
              value={addForm.role}
              onChange={(v) => setAddForm((f) => ({ ...f, role: v }))}
              options={ROLE_OPTIONS}
            />
          </div>
          {addError && <div className="form-error">{addError}</div>}
        </div>
      </Modal>

      {/* 批量导入 Modal */}
      <Modal
        open={batchModal}
        title="批量导入账号"
        onClose={handleBatchClose}
        typewriter={false}
        footer={(
          <>
            {batchPhase === 0 && <Button onClick={handleBatchClose}>取消</Button>}
            {batchPhase === 1 && (
              <>
                <Button onClick={() => setBatchPhase(0)}>返回</Button>
                <Button type="primary" loading={batchSubmitting} onClick={handleBatchSubmit}>确认导入</Button>
              </>
            )}
            {batchPhase === 2 && <Button type="primary" onClick={handleBatchClose}>关闭</Button>}
          </>
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* 阶段 0: 上传 */}
        {batchPhase === 0 && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: '0.875rem', color: '#725d42', marginBottom: 16, lineHeight: 1.8 }}>
              <strong>CSV 格式：</strong>用户名,密码,昵称,角色(可选)<br />
              角色可选值：<code>user</code> / <code>admin</code>，不填默认为 user<br />
              单次最多导入 <strong>50</strong> 条
            </div>
            <Button onClick={() => fileInputRef.current?.click()}>选择 CSV 文件</Button>
            {batchError && <div className="form-error" style={{ marginTop: 8 }}>{batchError}</div>}
          </div>
        )}

        {/* 阶段 1: 预览 */}
        {batchPhase === 1 && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 8, color: '#725d42', fontSize: '0.875rem' }}>
              共 <strong>{batchRows.length}</strong> 条记录，确认后开始导入
            </div>
            <div className="batch-table-wrapper" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e5d9c8', borderRadius: 6 }}>
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>密码</th>
                    <th>昵称</th>
                    <th>角色</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.username || <span className="form-error">（空）</span>}</td>
                      <td>{row.password ? '•'.repeat(Math.min(row.password.length, 8)) : <span className="form-error">（空）</span>}</td>
                      <td>{row.name || <span className="form-error">（空）</span>}</td>
                      <td>{row.role === 'admin' ? '管理员' : '普通玩家'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batchError && <div className="form-error" style={{ marginTop: 8 }}>{batchError}</div>}
          </div>
        )}

        {/* 阶段 2: 结果 */}
        {batchPhase === 2 && batchResult && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, fontSize: '0.875rem' }}>
              <div>✅ 成功创建：<strong>{batchResult.created.length}</strong> 个</div>
              <div>⏭️ 跳过（重复）：<strong>{batchResult.skipped.length}</strong> 个</div>
              <div>❌ 失败：<strong>{batchResult.errors.length}</strong> 个</div>
            </div>
            {batchResult.skipped.length > 0 && (
              <details style={{ marginBottom: 8, fontSize: '0.875rem' }}>
                <summary style={{ cursor: 'pointer', color: '#725d42', padding: '4px 0' }}>
                  查看跳过的用户（{batchResult.skipped.length} 个）
                </summary>
                <ul style={{ margin: '6px 0 0 16px', lineHeight: 1.8 }}>
                  {batchResult.skipped.map((s, i) => (
                    <li key={i}><code>{s.username}</code> — {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}
            {batchResult.errors.length > 0 && (
              <details style={{ fontSize: '0.875rem' }}>
                <summary style={{ cursor: 'pointer', color: '#e05a5a', padding: '4px 0' }}>
                  查看失败的条目（{batchResult.errors.length} 个）
                </summary>
                <ul style={{ margin: '6px 0 0 16px', lineHeight: 1.8 }}>
                  {batchResult.errors.map((err, i) => (
                    <li key={i}><code>{err.username}</code> — {err.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── 系统配置 Tab ────────────────────────────────────────────────
function ConfigTab() {
  const { showToast } = useToast()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSystemConfig()
      setConfig(data || {})
    } catch (e) {
      showToast(e.errorMessage || '获取配置失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const timer = setTimeout(() => fetchConfig(), 0)
    return () => clearTimeout(timer)
  }, [fetchConfig])

  const handleToggleRegistration = async (checked) => {
    setSaving(true)
    try {
      const data = await updateSystemConfig({ registrationOpen: checked })
      setConfig(data || { registrationOpen: checked })
      showToast('配置已保存', 'success')
    } catch (e) {
      showToast(e.errorMessage || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: '#9a835a', padding: 20 }}>加载中…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card color="app-teal">
        <div className="flex justify-between items-center">
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>开放注册</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>关闭后新用户无法注册账号</div>
          </div>
          <Switch
            checked={config?.registrationOpen !== false}
            loading={saving}
            checkedChildren="开放"
            unCheckedChildren="关闭"
            onChange={handleToggleRegistration}
          />
        </div>
      </Card>
    </div>
  )
}

// ─── 房间管理 Tab ────────────────────────────────────────────────
function RoomsTab() {
  const { showToast } = useToast()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRoomList()
      setRooms(data || [])
    } catch (e) {
      showToast(e.errorMessage || '获取房间列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const timer = setTimeout(() => fetchRooms(), 0)
    return () => clearTimeout(timer)
  }, [fetchRooms])

  const handleClose = (room) => {
    setConfirmModal({
      title: '确认关闭房间',
      message: `确认关闭房间「${room.name}」？游戏将强制结束。`,
      okText: '关闭房间',
      onOk: async () => {
        setConfirmSubmitting(true)
        try {
          await adminCloseRoom(room._id)
          await fetchRooms()
          setConfirmModal(null)
          showToast('房间已关闭', 'success')
        } catch (e) {
          showToast(e.errorMessage || '操作失败', 'error')
        } finally {
          setConfirmSubmitting(false)
        }
      }
    })
  }

  const handleDelete = (room) => {
    setConfirmModal({
      title: '确认删除房间',
      message: `确认删除房间「${room.name}」？此操作不可恢复。`,
      okText: '删除房间',
      onOk: async () => {
        setConfirmSubmitting(true)
        try {
          await adminDeleteRoom(room._id)
          setRooms((prev) => prev.filter((r) => r._id !== room._id))
          setConfirmModal(null)
          showToast('房间已删除', 'success')
        } catch (e) {
          showToast(e.errorMessage || '操作失败', 'error')
        } finally {
          setConfirmSubmitting(false)
        }
      }
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span style={{ color: '#725d42', fontWeight: 600 }}>共 {rooms.length} 个房间</span>
        <Button size="small" onClick={fetchRooms} loading={loading}>刷新</Button>
      </div>
      {rooms.length === 0 && !loading && (
        <div style={{ color: '#9a835a', textAlign: 'center', padding: 40 }}>暂无房间</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rooms.map((room) => (
          <Card key={room._id} color={ROOM_STATUS_COLOR[room.status] || 'default'}>
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <span style={{ fontWeight: 600 }}>{room.name}</span>
                <span style={{ marginLeft: 8, opacity: 0.6, fontSize: '0.85rem' }}>
                  {ROOM_STATUS_TEXT[room.status]} · 房主: {room.owner}
                </span>
                <span style={{ marginLeft: 8, fontSize: '0.8rem', opacity: 0.7 }}>
                  {room.seats?.filter((s) => s.player).length || 0}/{room.count} 人
                </span>
              </div>
              <div className="flex gap-8">
                {room.status !== 2 && (
                  <Button size="small" danger onClick={() => handleClose(room)}>关闭房间</Button>
                )}
                <Button size="small" danger onClick={() => handleDelete(room)}>删除</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!confirmModal}
        title={confirmModal?.title || '确认操作'}
        onClose={() => !confirmSubmitting && setConfirmModal(null)}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setConfirmModal(null)} disabled={confirmSubmitting}>取消</Button>
            <Button type="primary" danger loading={confirmSubmitting} onClick={confirmModal?.onOk}>
              {confirmModal?.okText || '确认'}
            </Button>
          </>
        )}
      >
        <div className="confirm-modal-message">{confirmModal?.message}</div>
      </Modal>
    </div>
  )
}

// ─── 主页面 ────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const tabs = [
    { key: 'users', label: '👥 用户管理', children: <UsersTab /> },
    { key: 'config', label: '⚙️ 系统配置', children: <ConfigTab /> },
    { key: 'rooms', label: '🏠 房间管理', children: <RoomsTab /> }
  ]

  return (
    <div className="page-wrapper" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="page-header mb-4">
        <div className="page-title">🛡️ 管理后台</div>
        <div className="page-header-actions">
          <span style={{ color: '#725d42' }}>👤 {user?.name || user?.username}</span>
          <Button onClick={() => navigate('/')}>返回大厅</Button>
          <Button type="text" onClick={() => { logout(); navigate('/login') }}>退出</Button>
        </div>
      </div>
      <Divider />
      <div style={{ marginTop: 16 }}>
        <Tabs items={tabs} defaultActiveKey="users" />
      </div>
    </div>
  )
}
