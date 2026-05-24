import { create } from 'zustand'

const initialState = {
  roomDetail: {},
  gameDetail: {},
  playerInfo: [],
  currentRole: {},
  skillInfo: [],
  actionInfo: [],
  error: null,
  recordModal: false,
  gameRecordList: [],
  actionModal: false,
  currentAction: '',
  actionPlayers: [],
  timerTime: null,
  confirmModal: null,
  winnerModal: null,
  isSkillLoading: false,
  onlineStatus: {}
}

export const useGameStore = create((set) => ({
  ...initialState,

  setRoomDetail: (v) => set({ roomDetail: v }),
  setGameDetail: (v) => set({ gameDetail: v }),
  setPlayerInfo: (v) => set({ playerInfo: v }),
  setCurrentRole: (v) => set({ currentRole: v }),
  setSkillInfo: (v) => set({ skillInfo: v }),
  setActionInfo: (v) => set({ actionInfo: v }),
  setError: (v) => set({ error: v }),
  setRecordModal: (v) => set({ recordModal: v }),
  setGameRecordList: (v) => set({ gameRecordList: v }),
  setActionModal: (v) => set({ actionModal: v }),
  setCurrentAction: (v) => set({ currentAction: v }),
  setActionPlayers: (v) => set((state) => ({
    actionPlayers: typeof v === 'function' ? v(state.actionPlayers) : v
  })),
  setTimerTime: (v) => set({ timerTime: v }),
  setConfirmModal: (v) => set({ confirmModal: v }),
  setWinnerModal: (v) => set({ winnerModal: v }),
  setIsSkillLoading: (v) => set({ isSkillLoading: v }),
  setOnlineStatus: (v) => set((state) => ({
    onlineStatus: typeof v === 'function' ? v(state.onlineStatus) : v
  })),
  resetGame: () => set({
    gameDetail: {},
    playerInfo: [],
    currentRole: {},
    skillInfo: [],
    actionInfo: [],
    recordModal: false,
    gameRecordList: [],
    actionModal: false,
    currentAction: '',
    actionPlayers: [],
    timerTime: null,
    confirmModal: null,
    winnerModal: null,
    isSkillLoading: false
  }),
  resetStore: () => set(initialState)
}))
