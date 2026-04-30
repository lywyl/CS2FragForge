import React, { useState, useCallback, useEffect } from 'react'
import { Info, ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { useTranslation } from '../i18n'
import type { Clip } from '../types/project'

const FRAME_STEP = 1 / 30

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function parseTime(text: string): number | null {
  const parts = text.split(':')
  if (parts.length !== 2) return null
  const m = parseInt(parts[0], 10)
  const s = parseFloat(parts[1])
  if (isNaN(m) || isNaN(s)) return null
  return m * 60 + s
}

interface ClipInspectorProps {
  clip: Clip | null
  clipIndex: number
  onSeek: (time: number) => void
  onDeselect: () => void
}

export const ClipInspector: React.FC<ClipInspectorProps> = ({
  clip,
  clipIndex,
  onSeek,
  onDeselect
}) => {
  const { t } = useTranslation()
  const updateClip = useProjectStore((s) => s.updateClip)
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')
  const [startError, setStartError] = useState(false)
  const [endError, setEndError] = useState(false)

  useEffect(() => {
    if (clip) {
      setStartInput(formatTime(clip.startSec))
      setEndInput(formatTime(clip.endSec))
      setStartError(false)
      setEndError(false)
    }
  }, [clip?.id, clip?.startSec, clip?.endSec])

  const commitStart = useCallback(() => {
    if (!clip) return
    const val = parseTime(startInput)
    if (val === null || val < 0 || val >= clip.endSec) {
      setStartError(true)
      return
    }
    setStartError(false)
    updateClip(clip.id, {
      startSec: val,
      timelineEnd: clip.timelineStart + (clip.endSec - val)
    })
  }, [clip, startInput, updateClip])

  const commitEnd = useCallback(() => {
    if (!clip) return
    const val = parseTime(endInput)
    if (val === null || val <= clip.startSec) {
      setEndError(true)
      return
    }
    setEndError(false)
    updateClip(clip.id, {
      endSec: val,
      timelineEnd: clip.timelineStart + (val - clip.startSec)
    })
  }, [clip, endInput, updateClip])

  const nudgeStart = useCallback(
    (delta: number) => {
      if (!clip) return
      const next = Math.max(0, Math.min(clip.endSec - FRAME_STEP, clip.startSec + delta))
      updateClip(clip.id, {
        startSec: next,
        timelineEnd: clip.timelineStart + (clip.endSec - next)
      })
    },
    [clip, updateClip]
  )

  const nudgeEnd = useCallback(
    (delta: number) => {
      if (!clip) return
      const next = Math.max(clip.startSec + FRAME_STEP, clip.endSec + delta)
      updateClip(clip.id, {
        endSec: next,
        timelineEnd: clip.timelineStart + (next - clip.startSec)
      })
    },
    [clip, updateClip]
  )

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!clip) return
      updateClip(clip.id, { volume: parseFloat(e.target.value) })
    },
    [clip, updateClip]
  )

  if (!clip) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-t border-gray-700 text-gray-500 text-sm">
        <Info className="w-4 h-4 shrink-0" />
        <span>{t('clipInspector.noSelection')}</span>
      </div>
    )
  }

  const duration = clip.endSec - clip.startSec
  const volumePercent = Math.round(clip.volume * 100)

  return (
    <div className="flex flex-col gap-2 px-4 py-3 bg-gray-800 border-t border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-200">
            {t('clipInspector.title')}
          </span>
          <span className="text-xs text-gray-500">
            {t('clipInspector.clipLabel', { index: clipIndex + 1 })}
          </span>
        </div>
        <button
          onClick={onDeselect}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {t('clipInspector.deselect')}
        </button>
      </div>

      {/* Time range */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Start point */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 w-8">{t('clipInspector.startPoint')}</span>
          <button
            onClick={() => nudgeStart(-FRAME_STEP)}
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            title={t('clipEditor.frameBack')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <input
            type="text"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={commitStart}
            onKeyDown={(e) => e.key === 'Enter' && commitStart()}
            className={`w-20 text-center text-sm bg-gray-900 border rounded px-1.5 py-0.5 text-gray-200 focus:outline-none ${
              startError ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
          <button
            onClick={() => nudgeStart(FRAME_STEP)}
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            title={t('clipEditor.frameForward')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSeek(clip.startSec)}
            className="p-0.5 text-gray-500 hover:text-blue-400 transition-colors"
            title={t('clipInspector.goToStart')}
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* End point */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 w-8">{t('clipInspector.endPoint')}</span>
          <button
            onClick={() => nudgeEnd(-FRAME_STEP)}
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            title={t('clipEditor.frameBack')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <input
            type="text"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={(e) => e.key === 'Enter' && commitEnd()}
            className={`w-20 text-center text-sm bg-gray-900 border rounded px-1.5 py-0.5 text-gray-200 focus:outline-none ${
              endError ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
          <button
            onClick={() => nudgeEnd(FRAME_STEP)}
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            title={t('clipEditor.frameForward')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSeek(clip.endSec)}
            className="p-0.5 text-gray-500 hover:text-blue-400 transition-colors"
            title={t('clipInspector.goToEnd')}
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Duration (read-only) */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">{t('clipInspector.duration')}</span>
          <span className="text-sm text-gray-200 font-mono">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 w-8">{t('clipInspector.volume')}</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={clip.volume}
          onChange={handleVolumeChange}
          className="flex-1 max-w-[200px] accent-blue-500"
        />
        <span className="text-sm text-gray-300 w-12 text-right">{volumePercent}%</span>
      </div>
    </div>
  )
}
