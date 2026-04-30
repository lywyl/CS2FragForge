export interface AppSettings {
  language: 'en' | 'zh'
  cs2InstallPath: string
  obsHost: string
  obsPort: number
  obsPassword: string
  preRoll: number
  postRoll: number
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'en',
  cs2InstallPath: '',
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  preRoll: 5,
  postRoll: 5
}
