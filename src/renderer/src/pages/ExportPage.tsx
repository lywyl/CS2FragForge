import React, { useState, useEffect, useCallback } from 'react'
import {
  Download,
  Film,
  Music,
  Settings2,
  XCircle,
  CheckCircle,
  FolderOpen,
  RotateCcw,
  Loader2
} from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { useTranslation } from '../i18n'
import type { ExportSettings } from '../../../shared/export-types'
import type { ExportProgress } from '../../../shared/export-types'

export const ExportPage: React.FC = () => {
  const { t } = useTranslation()
  const {
    project,
    exportStatus,
    exportProgress,
    exportSettings,
    setExportStatus,
    setExportProgress,
    setExportSettings,
    resetExport
  } = useProjectStore()

  const [showSettings, setShowSettings] = useState(false)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const clips = project?.clips ?? []
  const audioTracks = project?.audioTracks ?? []

  // Subscribe to export progress from main process
  useEffect(() => {
    if (exportStatus !== 'trimming' && exportStatus !== 'concatenating' && exportStatus !== 'mixing')
      return

    const unsubscribe = window.electronAPI.onExportProgress((progress: ExportProgress) => {
      setExportProgress(progress)
      if (progress.status === 'done') setExportStatus('done')
      if (progress.status === 'error') setExportStatus('error')
      if (progress.status === 'cancelled') setExportStatus('cancelled')
    })

    return unsubscribe
  }, [exportStatus, setExportProgress, setExportStatus])

  const handleExport = useCallback(async () => {
    if (clips.length === 0) return

    const path = await window.electronAPI.exportSelectOutput()
    if (!path) return

    setOutputPath(path)
    setErrorMsg(null)
    setExportStatus('trimming')
    setExportProgress({
      status: 'trimming',
      percent: 0,
      currentStep: 1,
      totalSteps: clips.length + (clips.length > 1 ? 1 : 0) + (audioTracks.length > 0 ? 1 : 0),
      stepLabel: t('export.preparing')
    })

    const result = await window.electronAPI.exportStart({
      clips: clips.map((c) => ({
        sourcePath: c.sourcePath,
        startSec: c.startSec,
        endSec: c.endSec,
        volume: c.volume
      })),
      audioTracks: audioTracks.map((at) => ({
        sourcePath: at.sourcePath,
        volume: at.volume,
        startSec: at.startSec,
        endSec: at.endSec
      })),
      outputPath: path,
      settings: exportSettings
    })

    if (!result.success) {
      setExportStatus('error')
      setErrorMsg(result.error || t('export.failed'))
    }
  }, [clips, audioTracks, exportSettings, setExportStatus, setExportProgress, t])

  const handleCancel = useCallback(async () => {
    await window.electronAPI.exportCancel()
    setExportStatus('cancelled')
  }, [setExportStatus])

  const handleReset = useCallback(() => {
    resetExport()
    setOutputPath(null)
    setErrorMsg(null)
  }, [resetExport])

  const totalDuration = clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0)

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${m}:${String(s).padStart(2, '0')}.${ms}`
  }

  // Active export (progress view)
  if (
    exportStatus === 'trimming' ||
    exportStatus === 'concatenating' ||
    exportStatus === 'mixing'
  ) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="w-full max-w-lg text-center">
          <Loader2 className="w-12 h-12 text-cs2-gold mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-bold text-white mb-2">{t('export.exporting')}</h2>
          <p className="text-cs2-text-muted mb-6">{exportProgress?.stepLabel || t('export.processing')}</p>

          <div className="w-full bg-cs2-elevated rounded-full h-3 mb-2">
            <div
              className="bg-cs2-gold h-3 rounded-full transition-all duration-300"
              style={{ width: `${exportProgress?.percent ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-cs2-text-muted mb-6">
            <span>{exportProgress?.percent ?? 0}%</span>
            <span>
              {t('export.step', {
                current: exportProgress?.currentStep ?? 0,
                total: exportProgress?.totalSteps ?? 0
              })}
            </span>
            {exportProgress?.eta && <span>{t('export.eta', { eta: exportProgress.eta })}</span>}
          </div>

          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <XCircle className="w-4 h-4 inline mr-2" />
            {t('export.cancel')}
          </button>
        </div>
      </div>
    )
  }

  // Export complete
  if (exportStatus === 'done') {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="w-full max-w-lg text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">{t('export.complete')}</h2>
          <p className="text-cs2-text-muted mb-2">{t('export.success')}</p>
          <p className="text-sm text-gray-500 mb-6 break-all">{outputPath}</p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                if (outputPath) {
                  const dir = outputPath.replace(/[\\/][^\\/]+$/, '')
                  window.electronAPI.openDialog({
                    filters: [{ name: 'All Files', extensions: ['*'] }]
                  })
                }
              }}
              className="px-4 py-2 bg-cs2-elevated hover:bg-cs2-border text-white rounded-lg transition-colors"
            >
              <FolderOpen className="w-4 h-4 inline mr-2" />
              {t('export.showInExplorer')}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep rounded-lg transition-colors font-medium"
            >
              <RotateCcw className="w-4 h-4 inline mr-2" />
              {t('export.exportAgain')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Error or cancelled
  if (exportStatus === 'error' || exportStatus === 'cancelled') {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="w-full max-w-lg text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            {exportStatus === 'cancelled' ? t('export.cancelled') : t('export.exportFailed')}
          </h2>
          {errorMsg && <p className="text-red-400 mb-6">{errorMsg}</p>}

          <button
            onClick={handleReset}
            className="px-4 py-2 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep rounded-lg transition-colors font-medium"
          >
            <RotateCcw className="w-4 h-4 inline mr-2" />
            {t('export.tryAgain')}
          </button>
        </div>
      </div>
    )
  }

  // Pre-export (default state)
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Download className="w-6 h-6" />
            {t('export.title')}
          </h1>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1.5 bg-cs2-elevated hover:bg-cs2-border text-gray-300 rounded-lg transition-colors text-sm flex items-center gap-1"
          >
            <Settings2 className="w-4 h-4" />
            {t('export.settings')}
          </button>
        </div>

        {/* Export Settings */}
        {showSettings && (
          <div className="bg-cs2-surface rounded-lg p-4 mb-6 border border-cs2-border">
            <h3 className="text-sm font-medium text-gray-300 mb-3">{t('export.settingsTitle')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-cs2-text-muted mb-1">{t('export.format')}</label>
                <select
                  value={exportSettings.outputFormat}
                  onChange={(e) =>
                    setExportSettings({ outputFormat: e.target.value as ExportSettings['outputFormat'] })
                  }
                  className="w-full bg-cs2-elevated text-white rounded px-2 py-1.5 text-sm border border-cs2-border"
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-cs2-text-muted mb-1">{t('export.videoCodec')}</label>
                <select
                  value={exportSettings.videoCodec}
                  onChange={(e) =>
                    setExportSettings({ videoCodec: e.target.value as ExportSettings['videoCodec'] })
                  }
                  className="w-full bg-cs2-elevated text-white rounded px-2 py-1.5 text-sm border border-cs2-border"
                >
                  <option value="libx264">H.264</option>
                  <option value="libx265">H.265</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-cs2-text-muted mb-1">
                  {t('export.quality', { crf: exportSettings.crf })}
                </label>
                <input
                  type="range"
                  min={18}
                  max={28}
                  value={exportSettings.crf}
                  onChange={(e) => setExportSettings({ crf: Number(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{t('export.higherQuality')}</span>
                  <span>{t('export.smallerFile')}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-cs2-text-muted mb-1">{t('export.resolution')}</label>
                <select
                  value={exportSettings.resolution}
                  onChange={(e) =>
                    setExportSettings({ resolution: e.target.value as ExportSettings['resolution'] })
                  }
                  className="w-full bg-cs2-elevated text-white rounded px-2 py-1.5 text-sm border border-cs2-border"
                >
                  <option value="source">{t('export.source')}</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-cs2-text-muted mb-1">{t('export.audioBitrate')}</label>
                <select
                  value={exportSettings.audioBitrate}
                  onChange={(e) => setExportSettings({ audioBitrate: e.target.value })}
                  className="w-full bg-cs2-elevated text-white rounded px-2 py-1.5 text-sm border border-cs2-border"
                >
                  <option value="128k">128k</option>
                  <option value="192k">192k</option>
                  <option value="256k">256k</option>
                  <option value="320k">320k</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Clips Summary */}
        <div className="bg-cs2-surface rounded-lg p-4 mb-4 border border-cs2-border">
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <Film className="w-4 h-4" />
            {t('export.clips', { count: clips.length })}
          </h3>
          {clips.length === 0 ? (
            <p className="text-gray-500 text-sm">{t('export.noClips')}</p>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    className="flex items-center justify-between text-sm bg-gray-750 rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-6 text-right">{i + 1}.</span>
                      <span className="text-gray-300 truncate max-w-xs">
                        {clip.sourcePath.split(/[\\/]/).pop()}
                      </span>
                    </div>
                    <span className="text-cs2-text-muted font-mono text-xs">
                      {formatTime(clip.startSec)} → {formatTime(clip.endSec)}
                      <span className="text-gray-500 ml-2">
                        ({formatTime(clip.endSec - clip.startSec)})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-sm text-cs2-text-muted border-t border-cs2-border pt-2">
                {t('export.totalDuration')}<span className="text-white font-mono">{formatTime(totalDuration)}</span>
              </div>
            </>
          )}
        </div>

        {/* Audio Tracks */}
        {audioTracks.length > 0 && (
          <div className="bg-cs2-surface rounded-lg p-4 mb-4 border border-cs2-border">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Music className="w-4 h-4" />
              {t('export.audioTracks', { count: audioTracks.length })}
            </h3>
            <div className="space-y-2">
              {audioTracks.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center justify-between text-sm bg-gray-750 rounded px-3 py-2"
                >
                  <span className="text-gray-300 truncate max-w-xs">
                    {track.sourcePath.split(/[\\/]/).pop()}
                  </span>
                  <span className="text-cs2-text-muted text-xs">
                    {t('export.vol', { percent: Math.round(track.volume * 100) })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={clips.length === 0}
          className="w-full py-3 bg-cs2-gold hover:bg-cs2-gold-dark disabled:bg-cs2-elevated disabled:text-gray-500 text-cs2-deep rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          {t('export.exportVideo')}
        </button>
      </div>
    </div>
  )
}
