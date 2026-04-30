import React, { useEffect, useState } from 'react'
import { Settings, Cpu, Monitor, Globe, RotateCcw, Loader2, AlertCircle, Search, Video } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useSettingsStore } from '../stores/useSettingsStore'
import { toast } from '../stores/useToastStore'
import type { AppSettings } from '../../../shared/settings-types'

export const SettingsPage: React.FC = () => {
  const { t, setLocale } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const isLoading = useSettingsStore((s) => s.isLoading)
  const error = useSettingsStore((s) => s.error)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const resetSettings = useSettingsStore((s) => s.resetSettings)

  const [isDetecting, setIsDetecting] = useState(false)
  const [isTestingObs, setIsTestingObs] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Sync language from persisted settings to i18n context
  useEffect(() => {
    if (settings?.language) {
      setLocale(settings.language)
    }
  }, [settings?.language, setLocale])

  const handleChange = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await updateSetting(key, value)
    const err = useSettingsStore.getState().error
    if (!err) {
      toast.success(t('settings.saved'))
    }
  }

  const handleBrowse = async () => {
    const path = await window.electronAPI.openDialog()
    if (path) {
      await updateSetting('cs2InstallPath', path)
      const err = useSettingsStore.getState().error
      if (!err) {
        toast.success(t('settings.saved'))
      }
    }
  }

  const handleAutoDetect = async () => {
    setIsDetecting(true)
    try {
      const envInfo = await window.electronAPI.cs2FindPath()
      if (envInfo?.cs2Path) {
        await updateSetting('cs2InstallPath', envInfo.cs2Path)
        const err = useSettingsStore.getState().error
        if (!err) {
          toast.success(t('settings.detected'))
        }
      } else {
        toast.error(t('settings.notDetected'))
      }
    } catch {
      toast.error(t('settings.notDetected'))
    } finally {
      setIsDetecting(false)
    }
  }

  const handleTestObsConnection = async () => {
    if (!settings) return
    setIsTestingObs(true)
    try {
      const result = await window.electronAPI.obsTestConnection({
        host: settings.obsHost,
        port: settings.obsPort,
        password: settings.obsPassword
      })
      if (result.success) {
        toast.success(t('settings.obsConnected', { version: result.version }))
      } else {
        toast.error(t('settings.obsConnectionFailed', { error: result.error }))
      }
    } catch (err) {
      toast.error(t('settings.obsConnectionFailed', { error: String(err) }))
    } finally {
      setIsTestingObs(false)
    }
  }

  const handleReset = async () => {
    setShowResetConfirm(false)
    await resetSettings()
    const err = useSettingsStore.getState().error
    if (!err) {
      toast.success(t('settings.reset'))
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-cs2-gold animate-spin" />
        <span className="text-cs2-text-muted text-sm">{t('settings.loading')}</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-red-400 text-sm">{t('settings.error')}</p>
        <button
          onClick={() => loadSettings()}
          className="px-4 py-2 bg-cs2-elevated hover:bg-cs2-border border border-cs2-border rounded text-cs2-text text-sm transition-colors"
        >
          {t('settings.retry')}
        </button>
      </div>
    )
  }

  // No settings loaded yet
  if (!settings) return null

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <h2 className="text-xl font-bold text-cs2-gold mb-6">{t('settings.title')}</h2>

      <div className="space-y-6 max-w-2xl">
        {/* Language */}
        <section className="bg-cs2-surface rounded-lg p-4 border border-cs2-border">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-5 h-5 text-cs2-gold" />
            <h3 className="text-lg font-medium text-cs2-text">{t('settings.language')}</h3>
          </div>
          <select
            value={settings.language}
            onChange={(e) => handleChange('language', e.target.value as AppSettings['language'])}
            className="w-full bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors appearance-none cursor-pointer"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </section>

        {/* CS2 Installation Path */}
        <section className="bg-cs2-surface rounded-lg p-4 border border-cs2-border">
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="w-5 h-5 text-cs2-gold" />
            <h3 className="text-lg font-medium text-cs2-text">{t('settings.cs2Install')}</h3>
          </div>
          <p className="text-sm text-cs2-text-muted mb-3">
            {t('settings.cs2Description')}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.cs2InstallPath}
              onChange={(e) => handleChange('cs2InstallPath', e.target.value)}
              className="flex-1 bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors"
              placeholder={t('settings.cs2Placeholder')}
            />
            <button
              onClick={handleAutoDetect}
              disabled={isDetecting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-cs2-elevated hover:bg-cs2-border border border-cs2-border rounded text-cs2-text transition-colors disabled:opacity-50"
            >
              {isDetecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {t('settings.autoDetect')}
            </button>
            <button
              onClick={handleBrowse}
              className="px-4 py-2 text-sm bg-cs2-elevated hover:bg-cs2-border border border-cs2-border rounded text-cs2-text transition-colors"
            >
              {t('settings.browse')}
            </button>
          </div>
        </section>

        {/* OBS WebSocket Connection */}
        <section className="bg-cs2-surface rounded-lg p-4 border border-cs2-border">
          <div className="flex items-center gap-2 mb-3">
            <Video className="w-5 h-5 text-cs2-gold" />
            <h3 className="text-lg font-medium text-cs2-text">{t('settings.obsTitle')}</h3>
          </div>
          <p className="text-sm text-cs2-text-muted mb-3">
            {t('settings.obsDescription')}
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-cs2-text-muted mb-1">{t('settings.obsHost')}</label>
              <input
                type="text"
                value={settings.obsHost}
                onChange={(e) => handleChange('obsHost', e.target.value)}
                className="w-full bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors"
                placeholder="127.0.0.1"
              />
            </div>
            <div>
              <label className="block text-xs text-cs2-text-muted mb-1">{t('settings.obsPort')}</label>
              <input
                type="number"
                value={settings.obsPort}
                onChange={(e) => handleChange('obsPort', Number(e.target.value))}
                className="w-32 bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors"
                min={1}
                max={65535}
              />
            </div>
            <div>
              <label className="block text-xs text-cs2-text-muted mb-1">{t('settings.obsPassword')}</label>
              <input
                type="password"
                value={settings.obsPassword}
                onChange={(e) => handleChange('obsPassword', e.target.value)}
                className="w-full bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors"
                placeholder="Optional"
              />
            </div>
            <button
              onClick={handleTestObsConnection}
              disabled={isTestingObs}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-cs2-elevated hover:bg-cs2-border border border-cs2-border rounded text-cs2-text transition-colors disabled:opacity-50"
            >
              {isTestingObs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('settings.testConnection')}
            </button>
          </div>
        </section>

        {/* Recording Settings */}
        <section className="bg-cs2-surface rounded-lg p-4 border border-cs2-border">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-5 h-5 text-cs2-gold" />
            <h3 className="text-lg font-medium text-cs2-text">{t('settings.recording')}</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-cs2-text-muted mb-1">
                {t('settings.preRoll')}
              </label>
              <input
                type="number"
                value={settings.preRoll}
                onChange={(e) => handleChange('preRoll', Number(e.target.value))}
                className="w-32 bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors"
                min={0}
                max={30}
              />
            </div>
            <div>
              <label className="block text-xs text-cs2-text-muted mb-1">
                {t('settings.postRoll')}
              </label>
              <input
                type="number"
                value={settings.postRoll}
                onChange={(e) => handleChange('postRoll', Number(e.target.value))}
                className="w-32 bg-cs2-elevated border border-cs2-border rounded px-3 py-2 text-sm text-cs2-text focus:outline-none focus:border-cs2-gold transition-colors"
                min={0}
                max={30}
              />
            </div>
          </div>
        </section>

        {/* About & Actions */}
        <section className="bg-cs2-surface rounded-lg p-4 border border-cs2-border">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-5 h-5 text-cs2-gold" />
            <h3 className="text-lg font-medium text-cs2-text">{t('settings.about')}</h3>
          </div>
          <p className="text-sm text-cs2-text-muted">{t('settings.version')}</p>
          <p className="text-xs text-cs2-text-muted mt-1">
            {t('settings.aboutDescription')}
          </p>
          <div className="mt-4 pt-4 border-t border-cs2-border">
            {showResetConfirm ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-cs2-text-muted">{t('settings.resetConfirm')}</span>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded text-white transition-colors"
                >
                  {t('settings.reset')}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 text-sm bg-cs2-elevated hover:bg-cs2-border border border-cs2-border rounded text-cs2-text transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-cs2-elevated hover:bg-cs2-border border border-cs2-border rounded text-cs2-text-muted transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {t('settings.reset')}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}