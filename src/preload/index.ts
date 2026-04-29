import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

contextBridge.usePlatformAPIs(electronAPI)

declare global {
  interface Window {
    electron: typeof electronAPI
    api: unknown
  }
}
