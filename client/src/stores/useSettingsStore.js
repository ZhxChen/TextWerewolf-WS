import { create } from 'zustand'

const STORAGE_KEY = 'werewolf_settings'

const getStoredSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const useSettingsStore = create((set) => ({
  // 减弱职业颜色显示：true = 所有角色卡片颜色统一为平民颜色
  reduceRoleColor: getStoredSettings().reduceRoleColor || false,

  setReduceRoleColor: (v) => {
    const stored = getStoredSettings()
    stored.reduceRoleColor = v
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    set({ reduceRoleColor: v })
  }
}))
