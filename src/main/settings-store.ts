import Store from 'electron-store'
import { AppSettings, DEFAULT_APP_SETTINGS } from '../shared/settings-types'

export const settingsStore = new Store<AppSettings>({
  name: 'app-settings',
  defaults: DEFAULT_APP_SETTINGS
})

export function getSettings(): AppSettings {
  return settingsStore.store
}

export function setSettings(settings: Partial<AppSettings>): AppSettings {
  settingsStore.set(settings)
  return settingsStore.store
}

export function resetSettings(): AppSettings {
  settingsStore.clear()
  return settingsStore.store
}
