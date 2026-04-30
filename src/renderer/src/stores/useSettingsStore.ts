import { create } from 'zustand'
import type { AppSettings } from '../../../shared/settings-types'
import { DEFAULT_APP_SETTINGS } from '../../../shared/settings-types'

interface SettingsStore {
  settings: AppSettings | null
  isLoading: boolean
  error: string | null
  loadSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  resetSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    // Guard against double-load
    if (get().settings !== null) return
    set({ isLoading: true, error: null })
    try {
      const settings = await window.electronAPI.settingsGet()
      set({ settings, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  updateSetting: async (key, value) => {
    // Optimistic update
    const current = get().settings ?? DEFAULT_APP_SETTINGS
    const updated = { ...current, [key]: value }
    set({ settings: updated })
    try {
      const result = await window.electronAPI.settingsSet(updated)
      set({ settings: result })
    } catch (err) {
      // Rollback on error
      set({ settings: current, error: String(err) })
    }
  },

  resetSettings: async () => {
    try {
      const result = await window.electronAPI.settingsReset()
      set({ settings: result })
    } catch (err) {
      set({ error: String(err) })
    }
  }
}))
