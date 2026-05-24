import { useState, useEffect } from 'react'
import { Card, Button, Input, Modal, Divider } from 'animal-island-ui'
import { useNavigate } from 'react-router-dom'
import { getRoomList, createRoom, joinRoom } from '../api/room'
import { changePassword, updateProfile } from '../api/auth'
import { useAuthStore } from '../stores/useAuthStore'
import { useToast } from '../components/Toast'
import { useLobbySocket } from '../hooks/useLobbySocket'

const ROOM_STATUS_COLOR = {
  0: 'app-yellow',
  1: 'app-orange',
  2: 'brown'
}

const ROOM_STATUS_TEXT = { 0: '等待中', 1: '游戏中', 2: '已关闭' }
const MODE_OPTIONS = [
  { value: 'standard_9', label: '标准9人局', desc: '3狼 · 预言家 · 女巫 · 猎人 · 3村民' },
  { value: 'standard_6', label: '标准6人局', desc: '2狼 · 预言家 · 女巫 · 2村民' }
]
const getModeLabel = (mode) => MODE_OPTIONS.find((m) => m.value === mode)?.label || mode

export default function LobbyPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', password: '', mode: 'standard_9', nightActionTime: 15, speakActionTime: 60, voteActionTime: 30 })
  // Password entry modal for joining a room
  const [pwdModal, setPwdModal] = useState(null)  // { room }
  const [roomPassword, setRoomPassword] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [enteringRoomId, setEnteringRoomId] = useState('')
  // Personal settings modal
  const [profileModal, setProfileModal] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileNameError, setProfileNameError] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [pwdForm, setPwdForm] = useState({ old: '', new: '', confirm: '' })
  const [pwdFormError, setPwdFormError] = useState('')
  const [pwdFormSaving, setPwdFormSaving] = useState(false)
  const [pwdFormSuccess, setPwdFormSuccess] = useState(false)

  const fetchRooms = async () => {
    setLoading(true)
    try {
      const data = await getRoomList()
      setRooms(data || [])
    } catch {
      // ignore fetch error in lobby refresh
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRooms()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  useLobbySocket(() => {
    fetchRooms()
  })

  const handleCreate = async () => {
    if (!form.password) return
    setCreating(true)
    try {
      const roomId = await createRoom(form)
      navigate(`/room/${roomId}`)
    } catch (e) {
      showToast(e.errorMessage || '创建失败', 'error')
    } finally {
      setCreating(false)
    }
  }

  const tryEnterRoom = async (room, password) => {
    const seatPlayers = room.seats?.filter((s) => s.player) || []
    const isMember = room.owner === user?.username || seatPlayers.some((seat) => seat.player === user?.username)
    const isFull = seatPlayers.length >= room.count

    if (isMember) {
      navigate(`/room/${room._id}`)
      return true
    }

    if (isFull) {
      showToast('房间已满', 'error')
      return false
    }

    setEnteringRoomId(room._id)
    try {
      await joinRoom({ id: room._id, password })
      if (password) {
        sessionStorage.setItem(`room_pwd_${room._id}`, password)
      }
      navigate(`/room/${room._id}`)
      return true
    } catch (e) {
      showToast(e.errorMessage || '进入房间失败', 'error')
      return false
    } finally {
      setEnteringRoomId('')
    }
  }

  const enterRoom = (room) => {
    const seatPlayers = room.seats?.filter((s) => s.player) || []
    const isMember = room.owner === user?.username || seatPlayers.some((seat) => seat.player === user?.username)
    if (!isMember && room.status !== 0) {
      showToast('游戏进行中，暂不可加入', 'error')
      return
    }
    if (room.hasPassword && room.owner !== user?.username && !isMember) {
      setRoomPassword('')
      setPwdError('')
      setPwdModal({ room })
    } else {
      void tryEnterRoom(room)
    }
  }

  const [pwdVerifying, setPwdVerifying] = useState(false)

  const handleEnterWithPassword = async () => {
    if (!roomPassword.trim()) {
      setPwdError('请输入密码')
      return
    }
    setPwdVerifying(true)
    try {
      const entered = await tryEnterRoom(pwdModal.room, roomPassword.trim())
      if (entered) {
        setPwdModal(null)
      } else {
        setPwdError('密码错误或房间已满')
      }
    } finally {
      setPwdVerifying(false)
    }
  }

  const openProfileModal = () => {
    setProfileName(user?.name || '')
    setProfileNameError('')
    setPwdForm({ old: '', new: '', confirm: '' })
    setPwdFormError('')
    setPwdFormSuccess(false)
    setProfileModal(true)
  }

  const handleSaveName = async () => {
    setProfileNameError('')
    if (!profileName.trim() || profileName.trim().length < 2 || profileName.trim().length > 12) {
      setProfileNameError('昵称需2-12个字符')
      return
    }
    setProfileSaving(true)
    try {
      const data = await updateProfile({ name: profileName.trim() })
      setAuth({ username: data.username, name: data.name, role: data.role }, data.token)
      setProfileModal(false)
    } catch (e) {
      setProfileNameError(e.errorMessage || '保存失败')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPwdFormError('')
    setPwdFormSuccess(false)
    if (!pwdForm.old || !pwdForm.new || !pwdForm.confirm) {
      setPwdFormError('请填写所有密码字段')
      return
    }
    if (pwdForm.new !== pwdForm.confirm) {
      setPwdFormError('两次新密码不一致')
      return
    }
    setPwdFormSaving(true)
    try {
      await changePassword({ oldPassword: pwdForm.old, newPassword: pwdForm.new })
      setPwdFormSuccess(true)
      setPwdForm({ old: '', new: '', confirm: '' })
    } catch (e) {
      setPwdFormError(e.errorMessage || '修改失败')
    } finally {
      setPwdFormSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div className="flex justify-between items-center mb-4">
        <div className="page-title">🐺 狼人杀大厅</div>
        <div className="flex gap-8 items-center">
          <Button type="text" style={{ color: '#725d42' }} onClick={openProfileModal}>
            👤 {user?.name || user?.username}
          </Button>
          {user?.role === 'admin' && (
            <Button type="default" onClick={() => navigate('/admin')}>🛡️ 管理后台</Button>
          )}
          <Button type="text" onClick={() => { logout(); navigate('/login') }}>退出</Button>
          <Button type="primary" onClick={() => setCreateModal(true)}>创建房间</Button>
          <Button onClick={fetchRooms} loading={loading}>刷新</Button>
        </div>
      </div>

      <Divider />

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {rooms.length === 0 && !loading && (
          <div style={{ color: '#9a835a', textAlign: 'center', padding: '40px', gridColumn: '1/-1' }}>
            暂无房间，创建一个吧～
          </div>
        )}
        {rooms.map((room) => (
          (() => {
            const seatPlayers = room.seats?.filter((s) => s.player) || []
            const occupiedCount = seatPlayers.length
            const isMember = room.owner === user?.username || seatPlayers.some((seat) => seat.player === user?.username)
            const isFull = occupiedCount >= room.count
            const blocked = !isMember && (room.status !== 0 || isFull)
            const buttonText = isMember ? '进入房间' : room.status !== 0 ? '游戏中' : isFull ? '已满' : '进入房间'

            return (
              <Card key={room._id} color={ROOM_STATUS_COLOR[room.status] || 'default'}>
                <div className="flex flex-col gap-8">
                  <div className="flex justify-between items-center">
                    <div className="font-bold" style={{ fontSize: '1rem' }}>{room.name}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{ROOM_STATUS_TEXT[room.status]}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                    {room.hasPassword ? '🔒 需要密码' : '🔓 无密码'} | 模式：{getModeLabel(room.mode)}
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                    {occupiedCount}/{room.count} 人
                  </div>
                  <Button
                    type={!blocked ? 'primary' : 'default'}
                    block
                    size="small"
                    loading={enteringRoomId === room._id}
                    disabled={blocked}
                    onClick={() => enterRoom(room)}
                  >
                    {buttonText}
                  </Button>
                </div>
              </Card>
            )
          })()
        ))}
      </div>

      {/* 创建房间 Modal */}
      <Modal
        open={createModal}
        title="创建房间"
        onClose={() => setCreateModal(false)}
        onOk={handleCreate}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setCreateModal(false)}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleCreate}>创建</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-12" style={{ padding: '8px 0' }}>
          <div>
            <div className="form-label">房间名称</div>
            <Input
              placeholder="狼人杀房间"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              allowClear
            />
          </div>
          <div>
            <div className="form-label">
              房间密码 * <span style={{ fontWeight: 400, opacity: 0.7 }}>（4-8位数字或字母）</span>
            </div>
            <Input
              placeholder="用于邀请好友，4-8位"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              allowClear
            />
          </div>
          <div>
            <div className="form-label">游戏模式</div>
            <div className="flex gap-8">
              {MODE_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, mode: opt.value }))}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `2px solid ${form.mode === opt.value ? '#b5895a' : '#d9c9a8'}`,
                    background: form.mode === opt.value ? '#f0e0c8' : '#f7ecd8',
                    color: '#725d42',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{opt.label}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: 2 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="form-label">
              夜间行动时间 <span style={{ fontWeight: 400, opacity: 0.7 }}>（预言家/狼人/女巫，10-30秒）</span>
            </div>
            <div className="flex items-center gap-8">
              <Input
                type="number"
                min={10}
                max={30}
                value={form.nightActionTime}
                onChange={(e) => {
                  const v = Math.min(30, Math.max(10, Number(e.target.value) || 15))
                  setForm((f) => ({ ...f, nightActionTime: v }))
                }}
                style={{ width: 80 }}
              />
              <span className="form-hint" style={{ fontSize: '0.85rem' }}>秒</span>
            </div>
          </div>
          <div>
            <div className="form-label">
              发言/遗言时间 <span style={{ fontWeight: 400, opacity: 0.7 }}>（30-120秒）</span>
            </div>
            <div className="flex items-center gap-8">
              <Input
                type="number"
                min={30}
                max={120}
                value={form.speakActionTime}
                onChange={(e) => {
                  const v = Math.min(120, Math.max(30, Number(e.target.value) || 60))
                  setForm((f) => ({ ...f, speakActionTime: v }))
                }}
                style={{ width: 80 }}
              />
              <span className="form-hint" style={{ fontSize: '0.85rem' }}>秒</span>
            </div>
          </div>
          <div>
            <div className="form-label">
              投票时间 <span style={{ fontWeight: 400, opacity: 0.7 }}>（5-30秒）</span>
            </div>
            <div className="flex items-center gap-8">
              <Input
                type="number"
                min={5}
                max={30}
                value={form.voteActionTime}
                onChange={(e) => {
                  const v = Math.min(30, Math.max(5, Number(e.target.value) || 30))
                  setForm((f) => ({ ...f, voteActionTime: v }))
                }}
                style={{ width: 80 }}
              />
              <span className="form-hint" style={{ fontSize: '0.85rem' }}>秒</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* 房间密码输入 Modal */}
      <Modal
        open={!!pwdModal}
        title={`进入房间 — ${pwdModal?.room?.name}`}
        onClose={() => setPwdModal(null)}
        typewriter={false}
        footer={(
          <>
            <Button onClick={() => setPwdModal(null)}>取消</Button>
            <Button type="primary" loading={pwdVerifying} onClick={handleEnterWithPassword}>进入</Button>
          </>
        )}
      >
        <div style={{ padding: '8px 0' }}>
          <div className="form-label" style={{ marginBottom: 8 }}>请输入房间密码</div>
          <Input
            placeholder="房间密码"
            value={roomPassword}
            onChange={(e) => { setRoomPassword(e.target.value); setPwdError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleEnterWithPassword()}
            allowClear
          />
          {pwdError && <div className="form-error" style={{ marginTop: 6, fontSize: '0.8rem' }}>{pwdError}</div>}
        </div>
      </Modal>

      {/* 个人设置 Modal */}
      <Modal
        open={profileModal}
        title="个人设置"
        onClose={() => setProfileModal(false)}
        typewriter={false}
        footer={<Button onClick={() => setProfileModal(false)}>关闭</Button>}
        width={480}
      >
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 修改昵称 */}
          <div>
            <div style={{ fontWeight: 600, color: '#725d42', marginBottom: 8 }}>修改昵称</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                placeholder="新昵称（2-12字符）"
                value={profileName}
                onChange={(e) => { setProfileName(e.target.value); setProfileNameError('') }}
                allowClear
              />
              <Button type="primary" loading={profileSaving} onClick={handleSaveName}>保存</Button>
            </div>
            {profileNameError && <div className="form-error" style={{ marginTop: 4, fontSize: '0.8rem' }}>{profileNameError}</div>}
          </div>
          <Divider />
          {/* 修改密码 */}
          <div>
            <div style={{ fontWeight: 600, color: '#725d42', marginBottom: 8 }}>修改密码</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input
                type="password"
                placeholder="原密码"
                value={pwdForm.old}
                onChange={(e) => { setPwdForm((f) => ({ ...f, old: e.target.value })); setPwdFormError(''); setPwdFormSuccess(false) }}
              />
              <Input
                type="password"
                placeholder="新密码"
                value={pwdForm.new}
                onChange={(e) => { setPwdForm((f) => ({ ...f, new: e.target.value })); setPwdFormError(''); setPwdFormSuccess(false) }}
              />
              <Input
                type="password"
                placeholder="确认新密码"
                value={pwdForm.confirm}
                onChange={(e) => { setPwdForm((f) => ({ ...f, confirm: e.target.value })); setPwdFormError(''); setPwdFormSuccess(false) }}
              />
              {pwdFormError && <div className="form-error" style={{ fontSize: '0.8rem' }}>{pwdFormError}</div>}
              {pwdFormSuccess && <div className="form-success" style={{ fontSize: '0.8rem' }}>密码修改成功</div>}
              <Button type="primary" loading={pwdFormSaving} onClick={handleChangePassword}>修改密码</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
