import { useEffect, useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Card, Button, Modal, Divider, Input, Switch } from 'animal-island-ui'
import { useNavigate, useParams } from 'react-router-dom'
import { getRoomInfo, joinRoom, quitRoom, deleteRoom } from '../api/room'
import {
  startGame,
  getGameInfo,
  nextStage,
  nextSpeaker,
  nextLastWordSpeaker,
  gameRecord,
  checkPlayer,
  assaultPlayer,
  antidotePlayer,
  votePlayer,
  poisonPlayer,
  shootPlayer,
  gameResult,
  gameDestroy,
  gameAgain,
  getChatHistory,
  restartGame
} from '../api/game'
import { useAuthStore } from '../stores/useAuthStore'
import { useGameStore } from '../stores/useGameStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { useToast } from '../components/Toast'

const PLAYER_CARD_COLOR = {
  dead: 'brown',
  wolf: 'app-red',
  predictor: 'purple',
  witch: 'purple',
  hunter: 'purple',
  villager: 'app-blue'
}

const ROLE_NAMES = {
  wolf: '狼人',
  predictor: '预言家',
  witch: '女巫',
  hunter: '猎人',
  villager: '村民'
}

const ACTION_CONFIG = {
  check: { title: '查验一位玩家', btnText: '查验他', color: 'default' },
  assault: { title: '袭击一位玩家', btnText: '袭击他', color: 'default' },
  poison: { title: '使用毒药', btnText: '撒毒', color: 'default' },
  shoot: { title: '开枪带走一位玩家', btnText: '开枪', color: 'default' },
  vote: { title: '投票放逐一位玩家', btnText: '投票', color: 'default' },
  antidote: { confirm: '确定要使用解药救下该玩家吗？' }
}

const SKILL_API_MAP = {
  check: checkPlayer,
  assault: assaultPlayer,
  poison: poisonPlayer,
  vote: votePlayer,
  shoot: shootPlayer,
  antidote: antidotePlayer
}

const STAGE_NAMES = {
  0: '准备阶段',
  1: '预言家阶段',
  2: '狼人阶段',
  3: '女巫阶段',
  4: '天亮结算',
  5: '发言阶段',
  6: '投票阶段',
  6.5: 'PK投票',
  7: '遗言阶段'
}

const TEXT_LEVEL_COLORS = { 1: '', 2: 'color-red', 3: 'color-green', 4: 'color-blue', 5: 'color-pink', 6: 'color-orange' }
const MODE_LABELS = { standard_9: '9人局', standard_6: '6人局' }
const getModeLabel = (mode) => MODE_LABELS[mode] || mode
const VOTE_STAGES = new Set([6, 6.5])
const SELF_ADVANCE_STAGE_BY_ROLE = {}

export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { showToast } = useToast()
  const { reduceRoleColor, setReduceRoleColor } = useSettingsStore()

  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [activeSidebarTab, setActiveSidebarTab] = useState('public')
  const [wolfSelections, setWolfSelections] = useState({})
  const [predictorSelection, setPredictorSelection] = useState(null)
  const [witchSelections, setWitchSelections] = useState({ antidote: false, poisonTargetUsername: null })
  const [voteSelections, setVoteSelections] = useState({})
  const [witchHistoryMarks, setWitchHistoryMarks] = useState({ poisoned: {}, saved: {} })
  const [stageTransitionOverlay, setStageTransitionOverlay] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const {
    roomDetail,
    gameDetail,
    playerInfo,
    currentRole,
    skillInfo,
    actionInfo,
    error,
    gameRecordList,
    actionModal,
    currentAction,
    actionPlayers,
    timerTime,
    confirmModal,
    winnerModal,
    isSkillLoading,
    onlineStatus,
    setRoomDetail,
    setGameDetail,
    setPlayerInfo,
    setCurrentRole,
    setSkillInfo,
    setActionInfo,
    setError,
    setGameRecordList,
    setActionModal,
    setCurrentAction,
    setActionPlayers,
    setTimerTime,
    setConfirmModal,
    setWinnerModal,
    setIsSkillLoading,
    setOnlineStatus,
    resetGame,
    resetStore
  } = useGameStore(useShallow((state) => ({
    roomDetail: state.roomDetail,
    gameDetail: state.gameDetail,
    playerInfo: state.playerInfo,
    currentRole: state.currentRole,
    skillInfo: state.skillInfo,
    actionInfo: state.actionInfo,
    error: state.error,
    gameRecordList: state.gameRecordList,
    actionModal: state.actionModal,
    currentAction: state.currentAction,
    actionPlayers: state.actionPlayers,
    timerTime: state.timerTime,
    confirmModal: state.confirmModal,
    winnerModal: state.winnerModal,
    isSkillLoading: state.isSkillLoading,
    onlineStatus: state.onlineStatus,
    setRoomDetail: state.setRoomDetail,
    setGameDetail: state.setGameDetail,
    setPlayerInfo: state.setPlayerInfo,
    setCurrentRole: state.setCurrentRole,
    setSkillInfo: state.setSkillInfo,
    setActionInfo: state.setActionInfo,
    setError: state.setError,
    setGameRecordList: state.setGameRecordList,
    setActionModal: state.setActionModal,
    setCurrentAction: state.setCurrentAction,
    setActionPlayers: state.setActionPlayers,
    setTimerTime: state.setTimerTime,
    setConfirmModal: state.setConfirmModal,
    setWinnerModal: state.setWinnerModal,
    setIsSkillLoading: state.setIsSkillLoading,
    setOnlineStatus: state.setOnlineStatus,
    resetGame: state.resetGame,
    resetStore: state.resetStore
  })))

  const gameDetailRef = useRef(gameDetail)
  useEffect(() => {
    gameDetailRef.current = gameDetail
  }, [gameDetail])

  const roomDetailRef = useRef(roomDetail)
  useEffect(() => {
    roomDetailRef.current = roomDetail
  }, [roomDetail])

  const prevStageRef = useRef(null)
  const overlayTimerRef = useRef(null)
  const drawerOpenRef = useRef(false)

  const closeActionModal = useCallback(() => {
    setActionModal(false)
    setActionPlayers([])
    setCurrentAction('')
    setIsSkillLoading(false)
  }, [setActionModal, setActionPlayers, setCurrentAction, setIsSkillLoading])
  const fetchChatLogs = useCallback(async (gId) => {
    const activeGameId = gId || gameDetailRef.current._id
    if (!activeGameId || !roomId) return
    try {
      const data = await getChatHistory({ roomId, gameId: activeGameId })
      setChatMessages(data || [])
    } catch {
      // ignore
    }
  }, [roomId])

  const fetchGameDetail = useCallback(async (gameId, rId) => {
    try {
      const data = await getGameInfo({ id: gameId, roomId: rId || roomId })
      setGameDetail(data)
      setCurrentRole(data.roleInfo || {})
      setPlayerInfo(data.playerInfo || [])
      setSkillInfo(data.skill || [])
      setActionInfo(data.action || [])
      setTimerTime((data.remainingTime != null && data.remainingTime > 0) ? data.remainingTime : null)
      if (data.wolfSelections != null) {
        setWolfSelections(data.wolfSelections)
      }
      if (data.predictorSelection != null) {
        setPredictorSelection(data.predictorSelection)
      } else {
        setPredictorSelection(null)
      }
      if (data.witchSelections != null) {
        setWitchSelections(data.witchSelections)
      } else {
        setWitchSelections({ antidote: false, poisonTargetUsername: null })
      }
      if (data.voteSelections != null) {
        setVoteSelections(data.voteSelections)
      } else {
        setVoteSelections({})
      }
      fetchChatLogs(gameId)
    } catch (e) {
      setError(e.errorMessage || '加载游戏失败')
    }
  }, [roomId, setActionInfo, setCurrentRole, setError, setGameDetail, setPlayerInfo, setSkillInfo, setTimerTime, fetchChatLogs])

  const fetchRoomDetail = useCallback(async () => {
    try {
      const data = await getRoomInfo({ id: roomId })
      setRoomDetail(data)
      if (data.onlineStatus) {
        setOnlineStatus((prev) => ({ ...prev, ...data.onlineStatus }))
      }
      if (data.status === 1 && data.gameId) {
        fetchGameDetail(data.gameId, data._id)
      }
    } catch (e) {
      if (['无权访问该房间', '房间不存在'].includes(e.errorMessage)) {
        showToast(e.errorMessage || '无法进入房间', 'error')
        navigate('/')
        return
      }
      setError(e.errorMessage || '加载房间失败')
    }
  }, [fetchGameDetail, navigate, roomId, setError, setOnlineStatus, setRoomDetail, showToast])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRoomDetail()
    }, 0)

    return () => {
      clearTimeout(timer)
      resetStore()
    }
  }, [fetchRoomDetail, resetStore])

  const handleGameOver = useCallback(async (gd) => {
    if (!gd._id) return
    try {
      const data = await gameResult({ id: gd._id })
      setWinnerModal(data)
    } catch {
      // ignore winner query failure
    }
  }, [setWinnerModal])

  const handleWsMessage = useCallback((event, data) => {
    const gd = gameDetailRef.current
    const rd = roomDetailRef.current

    switch (event) {
      case 'refreshRoom':
        fetchRoomDetail()
        break
      case 'refreshGame': {
        const rgGameId = gd._id || rd.gameId
        if (rgGameId) fetchGameDetail(rgGameId, roomId)
        break
      }
      case 'gameStart':
        fetchRoomDetail()
        break
      case 'connect': {
        // On (re)connect, sync state in case we missed events during disconnection
        const connGameId = gd._id || rd.gameId
        if (connGameId) fetchGameDetail(connGameId, roomId)
        else fetchRoomDetail()
        break
      }
      case 'stageChange': {
        closeActionModal()
        setTimerTime(null)
        const scGameId = gd._id || rd.gameId
        if (scGameId) fetchGameDetail(scGameId, roomId)
        else fetchRoomDetail()
        break
      }
      case 'gameOver':
        handleGameOver(gd)
        break
      case 'reStart':
        closeActionModal()
        resetGame()
        setWolfSelections({})
        setVoteSelections({})
        setWitchHistoryMarks({ poisoned: {}, saved: {} })
        fetchRoomDetail()
        break
      case 'timer':
        if (data && data.time !== null && data.time !== undefined) {
          setTimerTime(data.time)
        }
        break
      case 'chatMessage':
        if (data) {
          setChatMessages((prev) => {
            // Deduplicate by _id if exists, otherwise just append
            if (data._id && prev.some((msg) => msg._id === data._id)) return prev
            return [...prev, data]
          })
          if (!drawerOpenRef.current) {
            setHasNewMessage(true)
          }
        }
        break
      case 'chatError':
        if (typeof data === 'string') {
          showToast(data, 'error')
        }
        break
      case 'wolfSelectionsUpdate':
        if (data && typeof data === 'object') {
          setWolfSelections(data)
        }
        break
      case 'predictorSelectionUpdate':
        setPredictorSelection(data || null)
        break
      case 'witchSelectionsUpdate':
        if (data && typeof data === 'object') {
          setWitchSelections(data)
        }
        break
      case 'voteSelectionsUpdate':
        if (data && typeof data === 'object') {
          setVoteSelections(data)
        }
        break
      case 'playerOnlineStatus':
        if (data && data.username) {
          setOnlineStatus((prev) => ({ ...prev, [data.username]: data.online }))
        }
        break
      case 'roomClosed':
        fetchRoomDetail()
        break
      case 'roomDeleted':
        showToast('房间已被删除', 'error')
        navigate('/')
        break
      case 'kicked':
        showToast('你已被房主踢出房间', 'error')
        navigate('/')
        break
      default:
        break
    }
  }, [closeActionModal, fetchGameDetail, fetchRoomDetail, handleGameOver, navigate, resetGame, setOnlineStatus, setTimerTime, showToast, roomId])

  const socketRef = useWebSocket(roomId, handleWsMessage)

  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, activeSidebarTab])

  // Keep activeSidebarTab valid for the current player state
  useEffect(() => {
    if (isAdmin) return
    if (activeSidebarTab === 'wolf' && (currentRole.role !== 'wolf' || currentRole.status === 0)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSidebarTab('public')
    }
    
    // Ghost channel check:
    const lastWordPlayers = gameDetail.lastWordPlayers || []
    const currentSpeakerIdx = lastWordPlayers.indexOf(gameDetail.currentLastWordPosition)
    const playerIdx = lastWordPlayers.indexOf(currentRole.position)
    const isSpeakingOrWaitingLastWordsVal = Number(gameDetail.stage) === 7
      && playerIdx !== -1
      && (currentSpeakerIdx === -1 || playerIdx >= currentSpeakerIdx)

    if (activeSidebarTab === 'ghost' && (currentRole.status !== 0 || isSpeakingOrWaitingLastWordsVal)) {
      setActiveSidebarTab('public')
    }
  }, [isAdmin, currentRole.role, currentRole.status, activeSidebarTab, gameDetail.stage, gameDetail.lastWordPlayers, gameDetail.currentLastWordPosition, currentRole.position])

  // Accumulate witch action marks across all days
  useEffect(() => {
    if (currentRole.role !== 'witch' || !actionInfo.length) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWitchHistoryMarks((prev) => {
      let changed = false
      const next = { poisoned: { ...prev.poisoned }, saved: { ...prev.saved } }
      for (const a of actionInfo) {
        if (!a.to) continue
        if (a.action === 'poison' && !next.poisoned[a.to]) {
          next.poisoned[a.to] = true
          changed = true
        }
        if (a.action === 'antidote' && !next.saved[a.to]) {
          next.saved[a.to] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [actionInfo, currentRole.role])

  // Day/Night stage transition overlay (fires only on day↔night boundary)
  useEffect(() => {
    const current = Number(gameDetail.stage)
    if (!gameDetail._id) {
      prevStageRef.current = current
      return
    }
    const prev = prevStageRef.current
    prevStageRef.current = current
    if (prev === null || prev === current) return

    const NIGHT_STAGES = new Set([0, 1, 2, 3])
    const prevIsNight = NIGHT_STAGES.has(prev)
    const currentIsNight = NIGHT_STAGES.has(current)
    if (prevIsNight === currentIsNight) return

    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    setStageTransitionOverlay({ type: currentIsNight ? 'night' : 'day' })
    overlayTimerRef.current = setTimeout(() => {
      setStageTransitionOverlay(null)
      overlayTimerRef.current = null
    }, 2000)
  }, [gameDetail.stage, gameDetail._id])

  // Apply night theme to body
  useEffect(() => {
    const isNight = [0, 1, 2, 3].includes(Number(gameDetail.stage)) && !!gameDetail._id
    document.body.classList.toggle('theme-night', isNight)
    return () => document.body.classList.remove('theme-night')
  }, [gameDetail.stage, gameDetail._id])

  // Sync drawerOpen ref (used in WS handler closure)
  useEffect(() => {
    drawerOpenRef.current = drawerOpen
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (drawerOpen) setHasNewMessage(false)
  }, [drawerOpen])

  const handleSendChatMessage = (e) => {
    if (e) e.preventDefault()
    if (!chatInput.trim() || !socketRef.current) return
    if (!['public', 'wolf', 'ghost'].includes(activeSidebarTab)) return
    socketRef.current.emit('sendChatMessage', {
      roomId,
      gameId: gameDetail._id,
      channel: activeSidebarTab,
      content: chatInput.trim()
    })
    setChatInput('')
  }

  const handleSitDown = async (position) => {
    try {
      // Get stored password if we entered via lobby password modal
      const storedPwd = sessionStorage.getItem(`room_pwd_${roomId}`)
      await joinRoom({ id: roomId, position, password: storedPwd || undefined })
    } catch (e) {
      showToast(e.errorMessage || '落座失败', 'error')
    }
  }

  const handleQuit = async () => {
    if (isRoomOwner) {
      setConfirmModal({
        msg: '房主退出将解散房间，所有玩家将被移出。确定要解散吗？',
        onOk: async () => {
          setConfirmModal(null)
          try {
            await quitRoom({ id: roomId, username: user.username })
            navigate('/')
          } catch {
            navigate('/')
          }
        }
      })
      return
    }
    // Admin spectators just navigate away — no seat to vacate
    if (isAdmin) {
      navigate('/')
      return
    }
    try {
      await quitRoom({ id: roomId, username: user.username })
      navigate('/')
    } catch {
      navigate('/')
    }
  }

  const handleKickPlayer = (username, position) => {
    const seat = (roomDetail.seat || []).find((s) => s.player === username)
    const displayName = seat?.name || username
    setConfirmModal({
      msg: `确定要将 ${position} 号（${displayName}）踢出房间吗？`,
      onOk: async () => {
        setConfirmModal(null)
        try {
          await quitRoom({ id: roomId, username })
        } catch (e) {
          showToast(e.errorMessage || '踢出玩家失败', 'error')
        }
      }
    })
  }

  const handleDeleteRoom = () => {
    setConfirmModal({
      msg: '确定要删除这个房间吗？',
      onOk: async () => {
        setConfirmModal(null)
        try {
          await deleteRoom({ id: roomId })
          navigate('/')
        } catch (e) {
          showToast(e.errorMessage || '删除房间失败', 'error')
        }
      }
    })
  }

  const handleStartGame = async () => {
    try {
      await startGame({ roomId })
    } catch (e) {
      showToast(e.errorMessage || '开始游戏失败', 'error')
    }
  }

  const handleOpenRecordTab = async () => {
    setActiveSidebarTab('record')
    try {
      const data = await gameRecord({ roomId: gameDetail.roomId, gameId: gameDetail._id })
      setGameRecordList(Object.values(data || {}))
    } catch {
      // ignore record failure
    }
  }

  const buildActionPlayers = (key) => playerInfo.map((p) => {
    let canAct = true
    if (p.status === 0) canAct = false
    if (key === 'check') {
      if (p.isSelf) canAct = false
      if (p.camp !== null && p.camp !== undefined) canAct = false
    } else if (key === 'vote' && Number(gameDetail.stage) === 6.5 && gameDetail.pkCandidates?.length > 0) {
      if (!gameDetail.pkCandidates.includes(p.username)) canAct = false
    } else if (!p.isTarget) {
      canAct = false
    }
    return { ...p, canAct, isChosen: false }
  })

  const doAction = useCallback(async (targetPlayer, action) => {
    const params = { roomId: gameDetail.roomId, gameId: gameDetail._id }
    if (targetPlayer) params.username = targetPlayer.username
    const apiFunc = SKILL_API_MAP[action]
    if (!apiFunc) return

    setIsSkillLoading(true)
    try {
      const result = await apiFunc(params)
      if (result) {
        setActionPlayers((prev) => prev.map((p) => (
          p.username === result.username
            ? { ...p, camp: result.camp, campName: result.campName, isChosen: true }
            : p
        )))
      }
      await fetchGameDetail(gameDetail._id, roomDetail._id)
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    } finally {
      setIsSkillLoading(false)
    }
  }, [fetchGameDetail, gameDetail._id, gameDetail.roomId, roomDetail._id, setActionPlayers, setIsSkillLoading, showToast])

  const triggerSkill = (key) => {
    setCurrentAction(key)
    if (key === 'antidote') {
      const confirmMsg = key === 'antidote' && witchAntidoteTarget
        ? `确定要使用解药救下${witchAntidoteTarget.position}号（${witchAntidoteTarget.name}）吗？`
        : (ACTION_CONFIG[key]?.confirm || '确定吗？')
      setConfirmModal({
        msg: confirmMsg,
        onOk: async () => {
          setConfirmModal(null)
          await doAction(null, key)
        }
      })
      return
    }
    setActionPlayers(buildActionPlayers(key))
    setActionModal(true)
  }

  const handleNextStage = async (role) => {
    try {
      await nextStage({ roomId, gameId: gameDetail._id, ...(role ? { role } : {}) })
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    }
  }

  const handleNextSpeaker = async () => {
    try {
      await nextSpeaker({ roomId, gameId: gameDetail._id })
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    }
  }

  const handleNextLastWordSpeaker = async () => {
    try {
      await nextLastWordSpeaker({ roomId, gameId: gameDetail._id })
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    }
  }

  const handleDestroyGame = () => {
    setConfirmModal({
      msg: '确定要强制结束游戏吗？',
      onOk: async () => {
        setConfirmModal(null)
        try {
          await gameDestroy({ roomId, gameId: gameDetail._id })
        } catch (e) {
          showToast(e.errorMessage || '操作失败', 'error')
        }
      }
    })
  }

  const handleRestartGame = () => {
    setConfirmModal({
      msg: '确定要重新开始游戏吗？这会重新发牌并初始化游戏阶段。',
      onOk: async () => {
        setConfirmModal(null)
        try {
          await restartGame({ roomId })
        } catch (e) {
          showToast(e.errorMessage || '重开失败', 'error')
        }
      }
    })
  }

  const handleGameAgain = async () => {
    try {
      await gameAgain({ roomId })
      setWinnerModal(null)
    } catch (e) {
      showToast(e.errorMessage || '操作失败', 'error')
    }
  }

  const handleWolfSelectTarget = (targetUsername) => {
    if (!socketRef.current || !gameDetail._id) return
    const alreadySelected = wolfSelections[user?.username] === targetUsername
    socketRef.current.emit('wolfSelectTarget', {
      roomId,
      gameId: gameDetail._id,
      targetUsername: alreadySelected ? null : targetUsername
    })
  }

  const handleVoteSelectTarget = (targetUsername) => {
    if (!socketRef.current || !gameDetail._id) return
    const alreadySelected = voteSelections[user?.username] === targetUsername
    socketRef.current.emit('voteSelectTarget', {
      roomId,
      gameId: gameDetail._id,
      targetUsername: alreadySelected ? null : targetUsername
    })
  }

  const handleShootSelectTarget = (player) => {
    setCurrentAction('shoot')
    setConfirmModal({
      msg: `确定要开枪带走${player.position}号（${player.name || player.username}）吗？`,
      onOk: async () => {
        setConfirmModal(null)
        await doAction(player, 'shoot')
      }
    })
  }

  const handlePredictorSelectTarget = (targetUsername) => {
    if (!socketRef.current || !gameDetail._id) return
    const alreadySelected = predictorSelection === targetUsername
    socketRef.current.emit('predictorSelectTarget', {
      roomId,
      gameId: gameDetail._id,
      targetUsername: alreadySelected ? null : targetUsername
    })
  }

  const handleWitchSelectTarget = (targetUsername) => {
    if (!socketRef.current || !gameDetail._id) return
    const isAntidoteTarget = witchAntidoteTarget?.username === targetUsername

    let nextAntidote = witchSelections.antidote
    let nextPoisonTargetUsername;

    if (isAntidoteTarget) {
      nextAntidote = !witchSelections.antidote
      nextPoisonTargetUsername = null
    } else {
      if (witchSelections.poisonTargetUsername === targetUsername) {
        nextPoisonTargetUsername = null
      } else {
        nextPoisonTargetUsername = targetUsername
        nextAntidote = false
      }
    }

    socketRef.current.emit('witchSelectTarget', {
      roomId,
      gameId: gameDetail._id,
      antidote: nextAntidote,
      poisonTargetUsername: nextPoisonTargetUsername
    })
  }

  if (error) {
    return (
      <div className="page-container">
        <Card color="app-red">
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ marginBottom: 12 }}>{error}</div>
            <Button onClick={() => navigate('/')}>返回大厅</Button>
          </div>
        </Card>
      </div>
    )
  }

  const isRoomOwner = roomDetail.owner === user?.username
  const canManageRoom = isRoomOwner || isAdmin
  const isSeated = roomDetail.seat?.some((s) => s.player === user?.username)
  const currentSpeakerPosition = Number(gameDetail.currentSpeakerPosition)
  const isCurrentSpeaker = Number(currentRole.position) === currentSpeakerPosition
  const currentLastWordPosition = Number(gameDetail.currentLastWordPosition ?? -1)
  const isCurrentLastWordSpeaker = Number(gameDetail.stage) === 7
    && currentLastWordPosition > 0
    && Number(currentRole.position) === currentLastWordPosition
    && (gameDetail.lastWordPlayers || []).includes(currentLastWordPosition)
  const isCurrentPlayerAlive = currentRole.status !== 0
  const isWolfStage = Number(gameDetail.stage) === 2
  const isAliveWolf = currentRole.role === 'wolf' && isCurrentPlayerAlive
  const isNight = [0, 1, 2, 3].includes(Number(gameDetail.stage)) && !!gameDetail._id
  const isHunterShootStage = [4, 7].includes(Number(gameDetail.stage))
  const isDeadHunter = currentRole.role === 'hunter' && currentRole.status === 0
  const shootSkillAvailable = skillInfo.find((s) => s.key === 'shoot')?.status === 1

  const lastWordPlayers = gameDetail.lastWordPlayers || []
  const currentSpeakerIdx = lastWordPlayers.indexOf(gameDetail.currentLastWordPosition)
  const playerIdx = lastWordPlayers.indexOf(currentRole.position)
  const isSpeakingOrWaitingLastWords = Number(gameDetail.stage) === 7
    && playerIdx !== -1
    && (currentSpeakerIdx === -1 || playerIdx >= currentSpeakerIdx)

  const canSelfAdvanceStage = currentRole.role && SELF_ADVANCE_STAGE_BY_ROLE[currentRole.role] === Number(gameDetail.stage)
  const filteredSkills = skillInfo.filter((skill) => {
    if (['check', 'antidote', 'poison', 'assault', 'vote', 'shoot'].includes(skill.key)) return false
    return true
  })
  const displaySkills = filteredSkills
  const witchAntidoteTarget = gameDetail.witchInfo?.antidoteTarget || null
  const stageHelpText = getStageHelpText({
    stage: Number(gameDetail.stage),
    isCurrentSpeaker,
    isCurrentLastWordSpeaker,
    pkCandidates: gameDetail.pkCandidates || [],
    isHunterShootAvailable: isDeadHunter && isHunterShootStage && shootSkillAvailable
  })

  const getChatMuteReason = () => {
    if (!gameDetail._id) return '游戏尚未开始'
    
    if (!isSeated || !currentRole.position) {
      return '您当前为观众，无法发言'
    }

    if (activeSidebarTab === 'ghost') {
      if (currentRole.status !== 0) return '只有出局的玩家才能在亡灵频道发言'
      return null
    }
    
    if (activeSidebarTab === 'wolf') {
      if (currentRole.role !== 'wolf' || currentRole.status === 0) {
        return '您不是狼人或已出局，无法在狼人频道发言'
      }
      return null
    }
    
    if (activeSidebarTab === 'public') {
      const stage = Number(gameDetail.stage)
      const playerPosition = Number(currentRole.position)

      if (currentRole.status === 0) {
        // Dead player — only allow speaking during their own last-words turn
        if (stage === 7) {
          const clwp = Number(gameDetail.currentLastWordPosition ?? -1)
          const lwp = (gameDetail.lastWordPlayers || []).map(Number)
          if (playerPosition === clwp && lwp.includes(playerPosition)) return null
          if (lwp.includes(playerPosition)) return '请等待轮到您留遗言'
        }
        return '您已出局，无法在公开频道发言'
      }

      if ([1, 2, 3].includes(stage)) {
        return '夜晚已闭眼，请保持安静...'
      }
      if (stage === 5 && playerPosition !== currentSpeakerPosition) {
        return `请等待当前玩家（${currentSpeakerPosition}号）发言`
      }
      if (stage === 7) {
        return '当前为遗言阶段，请保持安静'
      }
    }
    return null
  }

  const chatMuteReason = getChatMuteReason()
  const isChatMuted = !!chatMuteReason

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  const filteredMessages = activeSidebarTab !== 'record'
    ? chatMessages.filter((msg) => msg.channel === activeSidebarTab)
    : []
  const isGameActive = roomDetail.status === 1 && !!gameDetail._id
  const showWolfTab = (currentRole.role === 'wolf' && currentRole.status === 1) || (isAdmin && isGameActive)
  const showGhostTab = (currentRole.status === 0 && !isSpeakingOrWaitingLastWords) || (isAdmin && isGameActive)
  const visibleChatTabs = [
    { key: 'public', label: '公开' },
    showWolfTab && { key: 'wolf', label: '狼人' },
    showGhostTab && { key: 'ghost', label: '亡灵' },
    isGameActive && { key: 'record', label: '记录' }
  ].filter(Boolean)

  const selectChatTab = (key) => {
    if (key === 'record') handleOpenRecordTab()
    else setActiveSidebarTab(key)
  }

  const handleChatTabKeyDown = (e) => {
    const currentIndex = visibleChatTabs.findIndex((tab) => tab.key === activeSidebarTab)
    if (currentIndex < 0) return

    let nextIndex
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % visibleChatTabs.length
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + visibleChatTabs.length) % visibleChatTabs.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = visibleChatTabs.length - 1
    else return

    e.preventDefault()
    selectChatTab(visibleChatTabs[nextIndex].key)
  }

  const renderRoleMarks = (player) => {
    if (player.isSelf) return null
    const marks = []

    if (currentRole.role === 'predictor' && player.camp !== null && player.camp !== undefined) {
      marks.push(
        <span key="camp" className={`role-mark ${player.camp === 0 ? 'mark-wolf' : 'mark-good'}`}>
          {player.camp === 0 ? '🐺 狼人' : '🛡️ 好人'}
        </span>
      )
    }

    if (currentRole.role === 'witch') {
      if (witchHistoryMarks.poisoned[player.username]) {
        marks.push(<span key="poison" className="role-mark mark-poison">💀 已毒</span>)
      }
      if (witchHistoryMarks.saved[player.username]) {
        marks.push(<span key="save" className="role-mark mark-save">❤️ 已救</span>)
      }
    }

    if (currentRole.role === 'wolf' && !player.isSelf && player.camp === 0 && player.status === 1 && !reduceRoleColor) {
      marks.push(<span key="wolfmate" className="role-mark mark-wolfmate">🐺 狼队</span>)
    }

    // God view: show role name badge for each player
    if (isAdmin && player.roleName && !reduceRoleColor) {
      marks.push(<span key="role" className="role-mark mark-god-role">{player.roleName}</span>)
    }

    return marks.length > 0 ? <div className="role-marks">{marks}</div> : null
  }

  return (
    <div style={{ maxWidth: isGameActive ? 1200 : 900, margin: '0 auto', padding: 16 }}>
      {/* Stage Transition Overlay */}
      {stageTransitionOverlay && (
        <div className={`stage-transition-overlay ${stageTransitionOverlay.type === 'night' ? 'entering-night' : 'entering-day'}`}>
          <div className="stage-transition-text">
            {stageTransitionOverlay.type === 'night' ? '天黑请闭眼...' : '天亮了，新的一天开始了...'}
          </div>
        </div>
      )}

      {/* Mobile chat drawer backdrop */}
      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Mobile floating chat button */}
      {isGameActive && (
        <button
          className="mobile-chat-fab"
          aria-label="打开聊天面板"
          aria-expanded={drawerOpen}
          aria-controls="room-chat-sidebar"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          💬
          {hasNewMessage && <span className="fab-badge" aria-hidden="true" />}
        </button>
      )}
      <div className="game-header">
        <div>
          <strong>{roomDetail.name || '狼人杀房间'}</strong>
          <span className="game-header-meta">
            {roomDetail.hasPassword ? '🔒 已设密码' : '🔓 无密码'}
            {' | '}{getModeLabel(roomDetail.mode)}
          </span>
        </div>
        <div className="flex gap-8 items-center">
          {timerTime > 0 && (
            <span className="game-timer">
              ⏱ {timerTime}s
            </span>
          )}
          <div className="settings-inline">
            <Switch
              size="small"
              checked={reduceRoleColor}
              onChange={setReduceRoleColor}
            />
            <span className="settings-inline-label">隐匿颜色</span>
          </div>
          {isAdmin && (
            <span className="god-view-badge">👁 上帝视角</span>
          )}
          {canManageRoom && gameDetail._id && gameDetail.status === 1 && (
            <Button size="small" type="primary" onClick={handleRestartGame}>重开</Button>
          )}
          {canManageRoom && gameDetail._id && (
            <Button size="small" danger onClick={handleDestroyGame}>结束</Button>
          )}
          {canManageRoom && !isRoomOwner && (
            <Button size="small" danger onClick={handleDeleteRoom}>删除房间</Button>
          )}
          <Button size="small" type={isRoomOwner ? 'default' : 'text'} danger={isRoomOwner} onClick={handleQuit}>
            {isRoomOwner ? '解散房间' : '离开'}
          </Button>
        </div>
      </div>

      {isGameActive ? (
        <div className="room-layout">
          {/* Left panel: 65% width */}
          <div className="room-main">
            {gameDetail._id && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Card color="app-yellow">
                  <div className="flex justify-between items-center">
                    <span>第 {gameDetail.day} 天 | {STAGE_NAMES[gameDetail.stage] || '准备'}</span>
                    {currentRole.role && (
                      <span>
                        你的角色：<strong>{ROLE_NAMES[currentRole.role]}</strong>
                      </span>
                    )}
                    {canManageRoom && gameDetail.status === 1 && ![1, 2, 3].includes(Number(gameDetail.stage)) && (
                      <Button size="small" type="primary" onClick={() => handleNextStage()}>
                        下一阶段
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {gameDetail._id && gameDetail.status === 1 && (
              <div style={{ marginBottom: 12 }}>
                <Card color="default">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!!gameDetail.broadcast?.length && (
                      <div style={{ fontSize: '0.95rem' }}>
                        {gameDetail.broadcast.map((item, index) => (
                          <span key={index} className={TEXT_LEVEL_COLORS[item.level] || ''}>{item.text}</span>
                        ))}
                      </div>
                    )}
                    <div className="stage-help-text">{stageHelpText}</div>
                    {isDeadHunter && isHunterShootStage && shootSkillAvailable && (
                      <div className="stage-alert-text">
                        🔫 你可以开枪！请点击一名存活玩家将其带走。
                      </div>
                    )}
                    {witchAntidoteTarget && (
                      <div className="stage-sub-text">
                        今晚被狼人击杀：{witchAntidoteTarget.position}号（{witchAntidoteTarget.name}）
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {playerInfo.length > 0 && (
              <div>
                <div className="player-grid">
                  {playerInfo.map((player) => {
                    const isDead = player.status === 0
                    const isSelf = player.username === user?.username
                    const playerIsCurrentSpeaker = gameDetail.stage === 5 && Number(player.position) === currentSpeakerPosition
                    const playerIsLastWordSpeaker = Number(gameDetail.stage) === 7
                      && Number(player.position) === currentLastWordPosition
                      && currentLastWordPosition > 0
                      && (gameDetail.lastWordPlayers || []).includes(Number(player.position))
                    let cardColor = isDead ? PLAYER_CARD_COLOR.dead : 'default'
                    if (!isDead && isSelf && currentRole.role) {
                      cardColor = reduceRoleColor
                        ? PLAYER_CARD_COLOR.villager
                        : (PLAYER_CARD_COLOR[currentRole.role] || 'default')
                    } else if (!isDead && isAdmin && player.role && !reduceRoleColor) {
                      // God view: color by actual role
                      cardColor = PLAYER_CARD_COLOR[player.role] || 'default'
                    } else if (!isDead && player.camp === 0 && (gameDetail.status === 2 || isSelf || currentRole.role === 'wolf')) {
                      cardColor = reduceRoleColor ? 'default' : 'app-red'
                    }

                    // Wolf targeting indicators (only visible to alive wolves during WOLF_STAGE)
                    const targetingWolvesPositions = isWolfStage && isAliveWolf
                      ? Object.entries(wolfSelections || {})
                        .filter(([, targetUsername]) => targetUsername === player.username)
                        .map(([wolfUsername]) => playerInfo.find((p) => p.username === wolfUsername)?.position)
                        .filter(Boolean)
                      : []
                    const isWolfTarget = targetingWolvesPositions.length > 0
                    const canWolfClick = isWolfStage && isAliveWolf && !isDead && !isSelf

                    // Predictor targeting indicators
                    const isPredictorStage = Number(gameDetail.stage) === 1
                    const isPredictor = currentRole.role === 'predictor' && isCurrentPlayerAlive
                    const canPredictorClick = isPredictorStage && isPredictor && !isDead && !isSelf
                    const isPredictorSelected = isPredictorStage && isPredictor && predictorSelection === player.username

                    // Witch targeting indicators
                    const isWitchStage = Number(gameDetail.stage) === 3
                    const isWitch = currentRole.role === 'witch' && isCurrentPlayerAlive
                    const isAntidoteTarget = witchAntidoteTarget && witchAntidoteTarget.username === player.username
                    const poisonSkill = skillInfo.find((s) => s.key === 'poison')
                    const canUsePoison = poisonSkill && poisonSkill.status === 1
                    const canWitchClickAntidote = isWitchStage && isWitch && isAntidoteTarget && !isDead
                    const canWitchClickPoison = isWitchStage && isWitch && !isAntidoteTarget && !isDead && canUsePoison
                    const canWitchClick = canWitchClickAntidote || canWitchClickPoison

                    const isAntidoteSelected = isWitchStage && isWitch && witchSelections.antidote && isAntidoteTarget
                    const isPoisonSelected = isWitchStage && isWitch && witchSelections.poisonTargetUsername === player.username

                    // Hunter shoot targeting
                    const canShootClick = isHunterShootStage && isDeadHunter && shootSkillAvailable && !isDead && !isSelf

                    // Vote targeting indicators
                    const isVoteStageActive = VOTE_STAGES.has(Number(gameDetail.stage))
                    const isPkVoteStage = Number(gameDetail.stage) === 6.5
                    const pkCandidates = gameDetail.pkCandidates || []
                    const isVoter = isVoteStageActive && isCurrentPlayerAlive && !(isPkVoteStage && pkCandidates.includes(user?.username))
                    const canBeVoted = isVoteStageActive && !isDead && !isSelf && (!isPkVoteStage || pkCandidates.includes(player.username))
                    const canVoteClick = isVoter && canBeVoted
                    const isMyVoteTarget = isVoteStageActive && isCurrentPlayerAlive && voteSelections[user?.username] === player.username
                    const votingForPositions = isVoteStageActive
                      ? Object.entries(voteSelections || {})
                        .filter(([, targetUsername]) => targetUsername === player.username)
                        .map(([voterUsername]) => playerInfo.find((p) => p.username === voterUsername)?.position)
                        .filter(Boolean)
                      : []
                    const isVoteTarget = votingForPositions.length > 0

                    const canClickCard = canWolfClick || canPredictorClick || canWitchClick || canVoteClick || canShootClick
                    const handlePlayerCardAction = () => {
                      if (canWolfClick) handleWolfSelectTarget(player.username)
                      else if (canPredictorClick) handlePredictorSelectTarget(player.username)
                      else if (canWitchClick) handleWitchSelectTarget(player.username)
                      else if (canVoteClick) handleVoteSelectTarget(player.username)
                      else if (canShootClick) handleShootSelectTarget(player)
                    }
                    const cardActionLabel = canClickCard
                      ? `${player.position}号玩家${player.name || player.username}，可选择为行动目标`
                      : undefined

                    const wrapperClasses = [
                      'player-card-wrapper',
                      isDead && 'player-card-dead',
                      playerIsCurrentSpeaker && 'speaking',
                      playerIsLastWordSpeaker && 'last-words',
                      isWolfTarget && 'wolf-targeted',
                      isPredictorSelected && 'predictor-selected',
                      isAntidoteSelected && 'antidote-selected',
                      isPoisonSelected && 'poison-selected',
                      isVoteTarget && !isMyVoteTarget && 'vote-targeted',
                      isMyVoteTarget && 'vote-my-target',
                      canShootClick && 'shoot-target',
                      !isDead && onlineStatus[player.username] === false && 'player-card-offline'
                    ].filter(Boolean).join(' ');

                    return (
                      <div
                        key={player.position}
                        className={wrapperClasses}
                        role={canClickCard ? 'button' : undefined}
                        tabIndex={canClickCard ? 0 : undefined}
                        aria-label={cardActionLabel}
                        onClick={canClickCard ? handlePlayerCardAction : undefined}
                        onKeyDown={canClickCard
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                handlePlayerCardAction()
                              }
                            }
                          : undefined}
                        style={{ cursor: canClickCard ? 'pointer' : undefined }}
                      >
                        {/* 1. Wolf selection floaters (top left) */}
                        {isWolfTarget && (
                          <div className="wolf-target-overlays">
                            {targetingWolvesPositions.map((pos) => (
                              <span key={pos} className="wolf-target-dot">🐺{pos}</span>
                            ))}
                          </div>
                        )}

                        {/* Predictor selection overlay */}
                        {isPredictorSelected && (
                          <div className="night-target-badge predictor-target">
                            🔮 查验中
                          </div>
                        )}

                        {/* Witch antidote selection overlay */}
                        {isAntidoteSelected && (
                          <div className="night-target-badge witch-heal-target">
                            🧪 救治中
                          </div>
                        )}

                        {/* Witch poison selection overlay */}
                        {isPoisonSelected && (
                          <div className="night-target-badge witch-poison-target">
                            ☠️ 毒杀中
                          </div>
                        )}

                        {/* Vote selection floaters (bottom left) */}
                        {isVoteTarget && (
                          <div className="vote-target-overlays">
                            {votingForPositions.map((pos) => (
                              <span key={pos} className="vote-target-dot">🗳️{pos}</span>
                            ))}
                          </div>
                        )}

                        {/* 2. Role marks floaters (top right) */}
                        {!isSelf && renderRoleMarks(player) && (
                          <div className="role-marks-floating">
                            {renderRoleMarks(player)}
                          </div>
                        )}

                        <Card color={cardColor}>
                          <div className="player-info-top">
                            <div className="player-position">{player.position}号</div>
                            <div className="player-name">{player.name || player.username}</div>
                          </div>
                          <div className="player-info-bottom">
                            {isSelf && currentRole.role && (
                              <div className="player-role-badge">{ROLE_NAMES[currentRole.role]}</div>
                            )}
                            {!isSelf && player.campName && (
                              <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 600 }}>{player.campName}</div>
                            )}
                            {playerIsCurrentSpeaker && (
                              <div className="player-status-speaking">🎙️ 正在发言</div>
                            )}
                            {playerIsLastWordSpeaker && (
                              <div className="player-status-lastwords">💬 正在遗言</div>
                            )}
                            {isDead && (
                              <div className="player-status-dead">已出局</div>
                            )}
                            {!isDead && onlineStatus[player.username] === false && (
                              <div className="player-status-offline">📵 离线</div>
                            )}
                          </div>
                        </Card>
                      </div>
                    )
                  })}
                </div>

                {gameDetail.stage === 5 && currentSpeakerPosition > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <Card color="app-yellow">
                      <div className="flex justify-between items-center" style={{ gap: 12, flexWrap: 'wrap' }}>
                        <span>当前发言：{currentSpeakerPosition}号玩家</span>
                        {isCurrentSpeaker && (
                          <Button type="primary" onClick={handleNextSpeaker}>
                            发言完毕
                          </Button>
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                {Number(gameDetail.stage) === 7 && currentLastWordPosition > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <Card color="app-red">
                      <div className="flex justify-between items-center" style={{ gap: 12, flexWrap: 'wrap' }}>
                        <span>
                          遗言：{currentLastWordPosition}号玩家
                          {(gameDetail.lastWordPlayers || []).length > 1 && (
                            <span style={{ fontSize: '0.8rem', opacity: 0.75, marginLeft: 6 }}>
                              （{(gameDetail.lastWordPlayers || []).indexOf(currentLastWordPosition) + 1}/{(gameDetail.lastWordPlayers || []).length}）
                            </span>
                          )}
                        </span>
                        {isCurrentLastWordSpeaker && (
                          <Button type="primary" onClick={handleNextLastWordSpeaker}>
                            遗言完毕
                          </Button>
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                {displaySkills.length > 0 && currentRole.role && (
                  <div style={{ marginTop: 16 }}>
                    <Divider />
                    <div className="skill-bar">
                      {displaySkills.map((skill) => {
                        const hasAction = actionInfo.some((a) => a.action === skill.key && a.day === gameDetail.day)
                        return (
                          <Button
                            key={skill.key}
                            type={skill.status === 1 && !hasAction ? 'primary' : 'default'}
                            disabled={skill.status !== 1 || hasAction || isSkillLoading}
                            loading={isSkillLoading && currentAction === skill.key}
                            onClick={() => triggerSkill(skill.key)}
                          >
                            {skill.name}
                            {hasAction ? '（已用）' : ''}
                          </Button>
                        )
                      })}
                      {canSelfAdvanceStage && (
                        <Button type="dashed" onClick={() => handleNextStage(currentRole.role)}>
                          完成行动
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gameDetail.status === 2 && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                {canManageRoom && (
                  <Button type="primary" onClick={handleGameAgain}>再来一局</Button>
                )}
              </div>
            )}
          </div>

          {/* Right panel: Chat Sidebar */}
          <div id="room-chat-sidebar" className={`room-sidebar${drawerOpen ? ' drawer-open' : ''}`}>
            <div className="chat-tabs" role="tablist" aria-label="聊天频道" onKeyDown={handleChatTabKeyDown}>
              <button
                id="chat-tab-public"
                className={`chat-tab chat-tab-public ${activeSidebarTab === 'public' ? 'active' : ''}`}
                role="tab"
                aria-selected={activeSidebarTab === 'public'}
                aria-controls="chat-panel-public"
                tabIndex={activeSidebarTab === 'public' ? 0 : -1}
                onClick={() => selectChatTab('public')}
              >
                💬 公开
              </button>
              {showWolfTab && (
                <button
                  id="chat-tab-wolf"
                  className={`chat-tab chat-tab-wolf ${activeSidebarTab === 'wolf' ? 'active' : ''}`}
                  role="tab"
                  aria-selected={activeSidebarTab === 'wolf'}
                  aria-controls="chat-panel-wolf"
                  tabIndex={activeSidebarTab === 'wolf' ? 0 : -1}
                  onClick={() => selectChatTab('wolf')}
                >
                  🐺 狼人
                </button>
              )}
              {showGhostTab && (
                <button
                  id="chat-tab-ghost"
                  className={`chat-tab chat-tab-ghost ${activeSidebarTab === 'ghost' ? 'active' : ''}`}
                  role="tab"
                  aria-selected={activeSidebarTab === 'ghost'}
                  aria-controls="chat-panel-ghost"
                  tabIndex={activeSidebarTab === 'ghost' ? 0 : -1}
                  onClick={() => selectChatTab('ghost')}
                >
                  ☠️ 亡灵
                </button>
              )}
              {isGameActive && (
                <button
                  id="chat-tab-record"
                  className={`chat-tab chat-tab-record ${activeSidebarTab === 'record' ? 'active' : ''}`}
                  role="tab"
                  aria-selected={activeSidebarTab === 'record'}
                  aria-controls="chat-panel-record"
                  tabIndex={activeSidebarTab === 'record' ? 0 : -1}
                  onClick={() => selectChatTab('record')}
                >
                  📜 记录
                </button>
              )}
            </div>

            {activeSidebarTab === 'record' ? (
              <div
                id="chat-panel-record"
                className="sidebar-record-panel"
                role="tabpanel"
                aria-labelledby="chat-tab-record"
              >
                {gameRecordList.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'rgba(114, 93, 66, 0.5)', fontSize: '0.85rem', marginTop: 20 }}>
                    暂无记录
                  </div>
                ) : (
                  <RecordPanel records={gameRecordList} />
                )}
              </div>
            ) : (
              <>
                <div
                  id={`chat-panel-${activeSidebarTab}`}
                  className="chat-messages-container"
                  role="tabpanel"
                  aria-labelledby={`chat-tab-${activeSidebarTab}`}
                >
                  <div className="chat-message-log" role="log" aria-live="polite" aria-relevant="additions">
                  {filteredMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'rgba(114, 93, 66, 0.5)', fontSize: '0.85rem', marginTop: 20 }}>
                      {activeSidebarTab === 'ghost' ? '亡灵频道空无一人...' : '暂无消息，来聊两句吧~'}
                    </div>
                  ) : (
                    filteredMessages.map((msg, i) => {
                      const isSelf = msg.sender === user?.username
                      const isWolfChannel = msg.channel === 'wolf'
                      const isGhostChannel = msg.channel === 'ghost'

                      let bubbleBg = 'rgba(255, 255, 255, 0.8)'
                      let bubbleBorder = '1px solid rgba(114, 93, 66, 0.15)'
                      let bubbleColor = '#3c3226'

                      if (isNight) {
                        if (isWolfChannel) {
                          bubbleBg = isSelf ? 'rgba(252, 115, 109, 0.25)' : 'rgba(252, 115, 109, 0.12)'
                          bubbleBorder = '1px solid rgba(252, 115, 109, 0.4)'
                          bubbleColor = '#ffb3b0'
                        } else if (isGhostChannel) {
                          bubbleBg = isSelf ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.12)'
                          bubbleBorder = '1px solid rgba(168, 85, 247, 0.4)'
                          bubbleColor = '#e9d5ff'
                        } else {
                          bubbleBg = isSelf ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)'
                          bubbleBorder = isSelf ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)'
                          bubbleColor = isSelf ? '#bbf7d0' : '#f5f5f4'
                        }
                      } else {
                        if (isWolfChannel) {
                          bubbleBg = isSelf ? 'rgba(252, 115, 109, 0.16)' : 'rgba(252, 115, 109, 0.08)'
                          bubbleBorder = '1px solid rgba(252, 115, 109, 0.3)'
                          bubbleColor = '#b22222'
                        } else if (isGhostChannel) {
                          bubbleBg = isSelf ? 'rgba(123, 31, 162, 0.14)' : 'rgba(123, 31, 162, 0.07)'
                          bubbleBorder = '1px solid rgba(123, 31, 162, 0.25)'
                          bubbleColor = '#6a0080'
                        } else if (isSelf) {
                          bubbleBg = 'rgba(138, 198, 138, 0.18)'
                          bubbleBorder = '1px solid rgba(138, 198, 138, 0.3)'
                        }
                      }

                      return (
                        <div key={msg._id || i} className="chat-message-item">
                          <div className="flex items-center flex-wrap" style={{ fontSize: '0.75rem', marginBottom: 2 }}>
                            {msg.senderPosition > 0 && (
                              <span className={`sender-badge ${isWolfChannel ? 'sender-badge-wolf' : isGhostChannel ? 'sender-badge-ghost' : 'sender-badge-public'}`}>
                                {msg.senderPosition}号
                              </span>
                            )}
                            <span style={{ fontWeight: 700, color: isNight ? '#d9cbb6' : '#725d42', marginRight: '6px' }}>
                              {msg.senderName || msg.sender}
                            </span>
                            {isWolfChannel && (
                              <span style={{ color: '#fc736d', fontWeight: 'bold', marginRight: '6px' }}>[狼人]</span>
                            )}
                            {isGhostChannel && (
                              <span style={{ color: '#7b1fa2', fontWeight: 'bold', marginRight: '6px' }}>☠️</span>
                            )}
                            <span style={{ fontSize: '0.65rem', color: 'rgba(114, 93, 66, 0.6)' }}>
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                          <div className="chat-bubble" style={{
                            backgroundColor: bubbleBg,
                            border: bubbleBorder,
                            color: bubbleColor
                          }}>
                            {msg.content}
                          </div>
                        </div>
                      )
                    })
                  )}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                {isChatMuted && (
                  <div className="chat-mute-warning">
                    <span>🔒</span>
                    <span>{chatMuteReason}</span>
                  </div>
                )}

                <form onSubmit={handleSendChatMessage} className="flex gap-8" style={{ marginTop: 'auto' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      placeholder={chatMuteReason || "说点什么吧..."}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isChatMuted}
                      allowClear
                    />
                  </div>
                  <Button
                    type={activeSidebarTab === 'ghost' ? 'default' : 'primary'}
                    danger={activeSidebarTab === 'wolf'}
                    disabled={isChatMuted || !chatInput.trim()}
                    onClick={handleSendChatMessage}
                    style={activeSidebarTab === 'ghost' ? { background: '#7b1fa2', color: '#fff', border: 'none' } : {}}
                  >
                    发送
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        roomDetail.status === 0 && (
          <div className="waiting-room-panel">
            <div className="waiting-room-header">
              <div className="waiting-room-title">选择座位</div>
              <div className="waiting-room-subtitle">
                已入座 {roomDetail.seat?.filter((s) => s.player).length || 0}/{roomDetail.count} 人
              </div>
            </div>

            <div className="seat-grid">
              {(roomDetail.seat || []).map((seat) => {
                const isSelfSeat = seat.player === user?.username
                const canKickSeat = canManageRoom && seat.player && !isSelfSeat

                return (
                  <div
                    key={seat.position}
                    className={`seat-card-wrapper${canKickSeat ? ' seat-kickable' : ''}${isSelfSeat ? ' seat-self' : ''}${seat.player ? ' seat-occupied' : ' seat-empty'}`}
                  >
                    {canKickSeat && (
                      <button
                        className="seat-kick-btn"
                        onClick={(e) => { e.stopPropagation(); handleKickPlayer(seat.player, seat.position) }}
                        title={`踢出 ${seat.name}`}
                        aria-label={`踢出 ${seat.name}`}
                      >
                        ×
                      </button>
                    )}
                    <Card color={isSelfSeat ? 'app-green' : seat.player ? 'app-blue' : 'default'}>
                      <div className="seat-card-content">
                        <div className="seat-position-badge">{seat.position}</div>
                        <div className="seat-player-name">{seat.player ? seat.name : '空座位'}</div>
                        <div className="seat-action-area">
                          {!seat.player && !isAdmin && (
                            <Button size="small" type="primary" block onClick={() => handleSitDown(seat.position)}>
                              落座
                            </Button>
                          )}
                          {isSelfSeat && <span className="seat-self-label">你的位置</span>}
                          {seat.player && !isSelfSeat && <span className="seat-occupied-label">已入座</span>}
                        </div>
                      </div>
                    </Card>
                  </div>
                )
              })}
            </div>

            {canManageRoom && isSeated && (
              <div className="waiting-room-actions">
                <Button type="primary" onClick={handleStartGame}>
                  开始游戏
                </Button>
              </div>
            )}
          </div>
        )
      )}

      <Modal
        open={actionModal}
        title={ACTION_CONFIG[currentAction]?.title || '选择目标'}
        onClose={closeActionModal}
        footer={<Button onClick={closeActionModal}>关闭</Button>}
        typewriter={false}
        width={500}
      >
        <div className="action-grid">
          {actionPlayers.map((p) => (
            <div key={p.position} className="action-card-wrapper">
              <Card color={p.isChosen ? 'app-green' : p.canAct ? 'app-yellow' : 'brown'}>
                <div className="action-player-info">
                  <div className="action-player-position">{p.position}号</div>
                  <div className="action-player-name">{p.name}</div>
                  <div className="action-player-result">
                    {currentAction === 'check' && p.isChosen && p.campName && p.campName}
                    {p.isChosen && currentAction !== 'check' && '✓ 已选择'}
                  </div>
                  <div className="action-player-button-area">
                    {p.canAct && !p.isChosen && (
                      <Button
                        size="small"
                        type="primary"
                        block
                        disabled={isSkillLoading}
                        loading={isSkillLoading}
                        onClick={() => doAction(p, currentAction)}
                      >
                        {ACTION_CONFIG[currentAction]?.btnText || '选择'}
                      </Button>
                    )}
                    {p.isChosen && currentAction === 'check' && <span className="action-selected-label">✓ 已选择</span>}
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </Modal>

      {confirmModal && (
        <Modal
          open={!!confirmModal}
          title="确认操作"
          onClose={() => setConfirmModal(null)}
          onOk={confirmModal.onOk}
          typewriter={false}
        >
          {confirmModal.msg}
        </Modal>
      )}

      {winnerModal && (
        <Modal
          open={!!winnerModal}
          title="游戏结束"
          onClose={() => setWinnerModal(null)}
          typewriter={false}
          footer={(
            <div className="flex gap-8 justify-center">
              <Button onClick={() => setWinnerModal(null)}>关闭</Button>
              {isRoomOwner && <Button type="primary" onClick={handleGameAgain}>再来一局</Button>}
            </div>
          )}
        >
          <div className="winner-content">
            <div className="winner-title">🏆 {winnerModal.winnerString} 胜利！</div>
            {currentRole.role && (
              <div className="winner-role">你的身份：{ROLE_NAMES[currentRole.role]}</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function RecordPanel({ records }) {
  const renderContent = (content) => {
    if (!content) return null
    if (typeof content === 'string') return <span>{content}</span>
    if (content.type === 'text') {
      return <span className={TEXT_LEVEL_COLORS[content.level] || ''}>{content.text}</span>
    }
    if (content.type === 'rich-text') {
      return (
        <span>
          {(content.content || []).map((part, i) => (
            <span key={i} className={TEXT_LEVEL_COLORS[part.level] || ''}>{part.text}</span>
          ))}
        </span>
      )
    }
    if (content.type === 'action') {
      return <span className={TEXT_LEVEL_COLORS[content.level] || ''}>{content.text}</span>
    }
    return <span>{JSON.stringify(content)}</span>
  }

  return (
    <div className="record-list">
      {records.map((dayGroup, i) => (
        <div key={i}>
          {(dayGroup.content || []).map((item, j) => (
            <div key={j} className={`record-item${item.isTitle ? ' record-title' : ''}`} style={{ paddingLeft: item.isTitle ? 8 : 4 }}>
              {item.isTitle ? (
                <strong style={{ color: '#725d42' }}>{item.content?.text}</strong>
              ) : (
                renderContent(item.content)
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function getStageHelpText({ stage, isCurrentSpeaker, isCurrentLastWordSpeaker, pkCandidates, isHunterShootAvailable }) {
  switch (stage) {
    case 0:
      return '准备阶段，倒计时结束后将自动进入首夜行动。'
    case 1:
      return '预言家行动阶段：请进行查验；此阶段为强制定时，倒计时结束后将自动推进。'
    case 2:
      return '狼人行动阶段：请左键选择袭击目标；此阶段为强制定时，请在此期间与队友进行战术沟通，倒计时结束后将自动锁定最高票玩家进行袭击。'
    case 3:
      return '女巫行动阶段：请使用解药或毒药；此阶段为强制定时，倒计时结束后将自动推进。'
    case 4:
      return isHunterShootAvailable
        ? '系统正在结算昨夜结果。你是今晚阵亡的猎人，请点击一名存活玩家进行开枪，倒计时结束后自动放弃。'
        : '系统正在结算昨夜结果。若你是猎人且今晚阵亡，请点击一名存活玩家进行开枪。倒计时结束后自动推进。'
    case 5:
      return isCurrentSpeaker
        ? '轮到你发言，发言结束后点击"发言完毕"，或等倒计时结束自动轮换。'
        : '等待当前发言玩家结束；倒计时结束自动轮换，房主也可以代为推进发言顺序。'
    case 6:
      return '请点击存活玩家卡片进行投票；倒计时结束后自动进入结算，房主也可手动点击"下一阶段"。'
    case 6.5:
      return `进入 PK 投票阶段，仅可投给 ${pkCandidates.join('、') || 'PK 候选人'}；倒计时结束后自动结算。`
    case 7:
      if (isCurrentLastWordSpeaker) return '轮到你留遗言，发言结束后点击"遗言完毕"，或等倒计时结束自动轮换。'
      if (isHunterShootAvailable) return '你是被放逐的猎人，请点击一名存活玩家进行开枪，倒计时结束后自动放弃。'
      return '当前为遗言阶段，请保持安静。若你是猎人且被放逐，请点击一名存活玩家进行开枪。倒计时结束后自动推进，房主也可代为推进。'
    default:
      return '等待当前阶段结算。'
  }
}
