export interface AppSettings {
  language: 'en' | 'zh'
  cs2InstallPath: string
  preRoll: number
  postRoll: number
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'en',
  cs2InstallPath: '',
  preRoll: 5,
  postRoll: 5
}
