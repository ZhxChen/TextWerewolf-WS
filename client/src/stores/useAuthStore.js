import { create } from 'zustand'

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('werewolf_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create((set) => ({
  user: getStoredUser(),
  token: localStorage.getItem('werewolf_token') || null,

  setAuth: (user, token) => {
    localStorage.setItem('werewolf_user', JSON.stringify(user))
    localStorage.setItem('werewolf_token', token)
    set({ user, token })
  },

  setToken: (token) => {
    localStorage.setItem('werewolf_token', token)
    set({ token })
  },

  logout: () => {
    localStorage.removeItem('werewolf_user')
    localStorage.removeItem('werewolf_token')
    set({ user: null, token: null })
  }
}))
