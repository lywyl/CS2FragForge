import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Circle,
  CheckCircle,
  XCircle,
  Loader2,
  Film,
  ArrowLeft,
  RotateCcw,
  SkipForward,
  AlertTriangle
} from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useTranslation } from '../i18n'
import type { RecordingProgress, RecordingRequest, RecordingHighlight } from '../../../shared/recording-types'

export const RecordingPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    project,
    recordingStatus,
    recordingProgress,
    recordingResult,
    setRecordingStatus,
    setRecordingProgress,
    setRecordingResult,
    resetRecording,
    setStatus
  } = useProjectStore()
  const { settings } = useSettingsStore()

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const startedRef = useRef(false)

  const selectedHighlights = project?.highlights.filter((h) => h.selected) ?? []

  // Auto-start recording when page loads, with progress listener set up first
  useEffect(() => {
    if (startedRef.current) return
    if (!project || selectedHighlights.length === 0 || !settings) return

    startedRef.current = true

    // Set up progress listener BEFORE starting recording to avoid race condition
    const unsubscribe = window.electronAPI.onRecordingProgress((progress: RecordingProgress) => {
      setRecordingProgress(progress)
      if (progress.status === 'done' || progress.status === 'error' || progress.status === 'cancelled') {
        setRecordingStatus(progress.status)
        if (progress.error) setErrorMsg(progress.error)
      }
    })

    handleStartRecording()

    return unsubscribe
  }, [])

  const handleStartRecording = useCallback(async () => {
    if (!project || !settings) return

    setErrorMsg(null)
    setRecordingStatus('preparing')
    setStatus('recording')

    const highlights: RecordingHighlight[] = selectedHighlights.map((h) => ({
      id: h.id,
      playerName: h.playerName,
      tickStart: h.tickStart,
      tickEnd: h.tickEnd,
      round: h.round,
      type: h.type,
      score: h.score
    }))

    const tickRate = project.gameInfo?.tickRate ?? 64

    const request: RecordingRequest = {
      demoPath: project.demoPath,
      highlights,
      cs2Path: project.cs2InstallPath || settings.cs2InstallPath,
      preRoll: settings.preRoll,
      postRoll: settings.postRoll,
      tickRate
    }

    try {
      const result = await window.electronAPI.recordingStart(request)
      setRecordingResult(result)

      if (result.success) {
        setRecordingStatus('done')
        setStatus('recorded')
      } else {
        setRecordingStatus('error')
        setErrorMsg(result.error || 'Recording failed')
      }
    } catch (err) {
      setRecordingStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Recording failed')
    }
  }, [project, settings, selectedHighlights])

  const handleCancel = useCallback(async () => {
    await window.electronAPI.recordingStop()
    setRecordingStatus('cancelled')
  }, [])

  const handleReset = useCallback(() => {
    resetRecording()
    setErrorMsg(null)
    startedRef.current = false
  }, [])

  const handleBackToProject = useCallback(() => {
    resetRecording()
    navigate('/project')
  }, [navigate])

  // No highlights selected
  if (selectedHighlights.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">{t('recording.noHighlights')}</h2>
          <button
            onClick={handleBackToProject}
            className="mt-4 px-4 py-2 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep rounded-lg font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4 inline mr-1" />
            {t('recording.backToProject')}
          </button>
        </div>
      </div>
    )
  }

  // Done state
  if (recordingStatus === 'done' && recordingResult) {
    const successClips = recordingResult.clips.filter((c) => c.success)
    const failedClips = recordingResult.clips.filter((c) => !c.success)

    return (
      <div className="h-full flex flex-col p-6">
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle className="w-8 h-8 text-green-400" />
          <div>
            <h2 className="text-xl font-bold text-white">{t('recording.complete')}</h2>
            <p className="text-cs2-text-muted text-sm">
              {t('recording.clipsRecorded', { count: successClips.length })}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-6">
          {recordingResult.clips.map((clip) => (
            <div
              key={clip.highlightId}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                clip.success
                  ? 'bg-green-900/20 border-green-800/50'
                  : 'bg-red-900/20 border-red-800/50'
              }`}
            >
              {clip.success ? (
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {clip.outputPath || clip.error}
                </p>
                {clip.success && (
                  <p className="text-xs text-cs2-text-muted">
                    {Math.round(clip.duration)}s
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {failedClips.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
            <p className="text-yellow-400 text-sm">
              {failedClips.length} clip(s) failed to record
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleBackToProject}
            className="flex-1 px-4 py-2.5 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep rounded-lg font-medium transition-colors"
          >
            {t('recording.backToProject')}
          </button>
          <button
            onClick={() => { handleReset(); startedRef.current = false }}
            className="px-4 py-2.5 bg-cs2-elevated hover:bg-cs2-border border border-cs2-border text-gray-300 rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4 inline mr-1" />
            {t('recording.recordAgain')}
          </button>
        </div>
      </div>
    )
  }

  // Error / Cancelled state
  if (recordingStatus === 'error' || recordingStatus === 'cancelled') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          {recordingStatus === 'cancelled' ? (
            <SkipForward className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          ) : (
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          )}
          <h2 className="text-xl font-bold text-white mb-2">
            {recordingStatus === 'cancelled' ? t('recording.cancelled') : t('recording.recordingFailed')}
          </h2>
          {errorMsg && (
            <p className="text-cs2-text-muted text-sm mb-4">{errorMsg}</p>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={handleBackToProject}
              className="px-4 py-2.5 bg-cs2-elevated hover:bg-cs2-border border border-cs2-border text-gray-300 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              {t('recording.backToProject')}
            </button>
            <button
              onClick={() => { handleReset(); setTimeout(() => { startedRef.current = false; handleStartRecording() }, 100) }}
              className="px-4 py-2.5 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep rounded-lg font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4 inline mr-1" />
              {t('recording.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active recording state
  const progress = recordingProgress
  const percent = progress?.percent ?? 0
  const currentHL = progress?.currentHighlight ?? 0
  const totalHL = progress?.totalHighlights ?? selectedHighlights.length
  const stepLabel = progress?.stepLabel ?? t('recording.preparing')

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 text-cs2-gold animate-spin" />
          <div>
            <h2 className="text-lg font-bold text-white">{t('recording.title')}</h2>
            <p className="text-sm text-cs2-text-muted">
              {t('recording.highlightOf', { current: currentHL, total: totalHL })}
            </p>
          </div>
        </div>
        <button
          onClick={handleCancel}
          className="px-4 py-1.5 text-sm bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 rounded-lg transition-colors"
        >
          {t('recording.cancel')}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-cs2-text-muted mb-1">
          <span>{stepLabel}</span>
          <span>{Math.round(percent)}%</span>
        </div>
        <div className="w-full h-2 bg-cs2-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-cs2-gold transition-all duration-500 ease-out rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Highlights list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {selectedHighlights.map((hl, index) => {
          const isCurrent = index + 1 === currentHL
          const isDone = index + 1 < currentHL || (recordingStatus === 'done' && index + 1 <= currentHL)
          const isPending = index + 1 > currentHL && recordingStatus !== 'done'

          return (
            <div
              key={hl.id}
              className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                isCurrent
                  ? 'bg-cs2-gold/10 border border-cs2-gold/30'
                  : 'bg-cs2-surface border border-transparent'
              }`}
            >
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-cs2-gold animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-cs2-text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isCurrent ? 'text-white font-medium' : 'text-gray-400'}`}>
                  {hl.playerName} — {hl.type} — {t('recording.round')} {hl.round}
                </p>
              </div>
              <span className="text-xs text-cs2-text-muted flex-shrink-0">
                #{index + 1}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
