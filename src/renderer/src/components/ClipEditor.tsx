import React, { useState, useCallback, useEffect } from 'react'
import { Scissors, Plus, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '../i18n'

const FRAME_STEP = 1 / 30

interface ClipEditorProps {
  currentTime: number
  duration: number
  inPoint: number | null
  outPoint: number | null
  onInPointChange: (time: number | null) => void
  onOutPointChange: (time: number | null) => void
  onSeek: (time: number) => void
  onAddClip: (startSec: number, endSec: number) => void
  onPreviewTrim: (startSec: number, endSec: number) => void
  triggerSetIn?: number
  triggerSetOut?: number
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function parseTime(str: string): number | null {
  const match = str.match(/^(\d+):(\d{2})(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const m = parseInt(match[1], 10)
  const s = parseInt(match[2], 10)
  const ms = match[3] ? parseInt(match[3].padEnd(2, '0'), 10) : 0
  return m * 60 + s + ms / 100
}

export const ClipEditor: React.FC<ClipEditorProps> = ({
  currentTime,
  duration,
  inPoint,
  outPoint,
  onInPointChange,
  onOutPointChange,
  onSeek,
  onAddClip,
  onPreviewTrim,
  triggerSetIn,
  triggerSetOut
}) => {
  const { t } = useTranslation()
  const [inInput, setInInput] = useState('')
  const [outInput, setOutInput] = useState('')

  // Sync text inputs when parent sets in/out points (e.g., keyboard shortcuts)
  useEffect(() => {
    if (inPoint !== null) setInInput(formatTime(inPoint))
    else setInInput('')
  }, [inPoint])

  useEffect(() => {
    if (outPoint !== null) setOutInput(formatTime(outPoint))
    else setOutInput('')
  }, [outPoint])

  // Handle external trigger for Set In (I key)
  useEffect(() => {
    if (triggerSetIn !== undefined && triggerSetIn > 0) {
      onInPointChange(currentTime)
    }
  }, [triggerSetIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle external trigger for Set Out (O key)
  useEffect(() => {
    if (triggerSetOut !== undefined && triggerSetOut > 0) {
      onOutPointChange(currentTime)
    }
  }, [triggerSetOut]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetIn = useCallback(() => {
    onInPointChange(currentTime)
  }, [currentTime, onInPointChange])

  const handleSetOut = useCallback(() => {
    onOutPointChange(currentTime)
  }, [currentTime, onOutPointChange])

  const handleInInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInInput(e.target.value)
    const parsed = parseTime(e.target.value)
    if (parsed !== null && parsed >= 0 && parsed <= duration) {
      onInPointChange(parsed)
    }
  }, [duration, onInPointChange])

  const handleOutInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOutInput(e.target.value)
    const parsed = parseTime(e.target.value)
    if (parsed !== null && parsed >= 0 && parsed <= duration) {
      onOutPointChange(parsed)
    }
  }, [duration, onOutPointChange])

  const nudgeInPoint = useCallback((delta: number) => {
    if (inPoint === null) return
    const newTime = Math.max(0, Math.min(duration, inPoint + delta))
    onInPointChange(newTime)
  }, [inPoint, duration, onInPointChange])

  const nudgeOutPoint = useCallback((delta: number) => {
    if (outPoint === null) return
    const newTime = Math.max(0, Math.min(duration, outPoint + delta))
    onOutPointChange(newTime)
  }, [outPoint, duration, onOutPointChange])

  const canAddClip = inPoint !== null && outPoint !== null && outPoint > inPoint

  const handleAddClip = useCallback(() => {
    if (canAddClip) {
      onAddClip(inPoint!, outPoint!)
      onInPointChange(null)
      onOutPointChange(null)
    }
  }, [canAddClip, inPoint, outPoint, onAddClip, onInPointChange, onOutPointChange])

  const handlePreview = useCallback(() => {
    if (canAddClip) {
      onPreviewTrim(inPoint!, outPoint!)
    }
  }, [canAddClip, inPoint, outPoint, onPreviewTrim])

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-gray-800 border-t border-gray-700">
      <Scissors className="w-4 h-4 text-gray-400 shrink-0" />

      {/* In point */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleSetIn}
          className="px-2 py-1 text-xs font-medium bg-green-700/50 hover:bg-green-700 text-green-300 rounded transition-colors"
        >
          {t('clipEditor.inButton')}
        </button>
        <button
          onClick={() => nudgeInPoint(-FRAME_STEP)}
          disabled={inPoint === null}
          className="p-0.5 text-gray-500 hover:text-green-400 disabled:opacity-30 transition-colors"
          title={t('clipEditor.frameBack')}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <input
          type="text"
          value={inInput}
          onChange={handleInInputChange}
          placeholder="0:00.00"
          className="w-20 px-2 py-1 text-xs font-mono bg-gray-900 border border-gray-600 rounded text-gray-300 focus:border-green-500 focus:outline-none"
        />
        <button
          onClick={() => nudgeInPoint(FRAME_STEP)}
          disabled={inPoint === null}
          className="p-0.5 text-gray-500 hover:text-green-400 disabled:opacity-30 transition-colors"
          title={t('clipEditor.frameForward')}
        >
          <ChevronRight className="w-3 h-3" />
        </button>
        {inPoint !== null && (
          <button
            onClick={() => onSeek(inPoint)}
            className="text-gray-500 hover:text-green-400 transition-colors"
            title={t('clipEditor.goToIn')}
          >
            <Play className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Out point */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleSetOut}
          className="px-2 py-1 text-xs font-medium bg-red-700/50 hover:bg-red-700 text-red-300 rounded transition-colors"
        >
          {t('clipEditor.outButton')}
        </button>
        <button
          onClick={() => nudgeOutPoint(-FRAME_STEP)}
          disabled={outPoint === null}
          className="p-0.5 text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors"
          title={t('clipEditor.frameBack')}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <input
          type="text"
          value={outInput}
          onChange={handleOutInputChange}
          placeholder="0:00.00"
          className="w-20 px-2 py-1 text-xs font-mono bg-gray-900 border border-gray-600 rounded text-gray-300 focus:border-red-500 focus:outline-none"
        />
        <button
          onClick={() => nudgeOutPoint(FRAME_STEP)}
          disabled={outPoint === null}
          className="p-0.5 text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors"
          title={t('clipEditor.frameForward')}
        >
          <ChevronRight className="w-3 h-3" />
        </button>
        {outPoint !== null && (
          <button
            onClick={() => onSeek(outPoint)}
            className="text-gray-500 hover:text-red-400 transition-colors"
            title={t('clipEditor.goToOut')}
          >
            <Play className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Duration display */}
      {canAddClip && (
        <span className="text-xs text-gray-500 font-mono">
          {formatTime(outPoint! - inPoint!)}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={handlePreview}
          disabled={!canAddClip}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 rounded transition-colors"
        >
          <Play className="w-3 h-3" />
          {t('clipEditor.preview')}
        </button>
        <button
          onClick={handleAddClip}
          disabled={!canAddClip}
          className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          {t('clipEditor.addToTimeline')}
        </button>
      </div>
    </div>
  )
}
