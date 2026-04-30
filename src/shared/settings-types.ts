export interface AppSettings {
  language: 'en' | 'zh'
  cs2InstallPath: string
  preRoll: number
  postRoll: number
  obsHost: string
  obsPort: number
  obsPassword: string
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'en',
  cs2InstallPath: '',
  preRoll: 5,
  postRoll: 5,
  obsHost: '127.0.0.1',
  obsPort: 4455,
  obsPassword: ''
}
