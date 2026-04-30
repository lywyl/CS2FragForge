import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Trash2, GripVertical } from 'lucide-react'
import { useTranslation } from '../i18n'
import type { Clip } from '../types/project'

interface TimelineProps {
  clips: Clip[]
  currentTime: number
  onSelectClip: (clip: Clip) => void
  onDeleteClip: (id: string) => void
  onReorderClips: (fromIndex: number, toIndex: number) => void
  onSeek?: (time: number) => void
  selectedClipId?: string | null
}

const CLIP_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-teal-600',
  'bg-orange-600',
  'bg-pink-600',
  'bg-cyan-600'
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Convert video time to timeline position (cumulative clip duration).
 * Returns the position in seconds along the timeline, or -1 if not found.
 */
function videoTimeToTimelinePos(clips: Clip[], videoTime: number): number {
  let accumulated = 0
  for (const clip of clips) {
    const clipDuration = clip.endSec - clip.startSec
    if (videoTime >= clip.startSec && videoTime <= clip.endSec) {
      return accumulated + (videoTime - clip.startSec)
    }
    accumulated += clipDuration
  }
  // If outside any clip, snap to nearest boundary
  if (clips.length > 0) {
    if (videoTime < clips[0].startSec) return 0
    return accumulated // end of timeline
  }
  return -1
}

/**
 * Convert timeline position to video time.
 * Returns the video time in seconds.
 */
function timelinePosToVideoTime(clips: Clip[], timelinePos: number): number {
  let accumulated = 0
  for (const clip of clips) {
    const clipDuration = clip.endSec - clip.startSec
    if (timelinePos <= accumulated + clipDuration) {
      const offset = timelinePos - accumulated
      return clip.startSec + offset
    }
    accumulated += clipDuration
  }
  // Past the end — return last clip's end
  if (clips.length > 0) {
    return clips[clips.length - 1].endSec
  }
  return 0
}

export const Timeline: React.FC<TimelineProps> = ({
  clips,
  currentTime,
  onSelectClip,
  onDeleteClip,
  onReorderClips,
  onSeek,
  selectedClipId
}) => {
  const { t } = useTranslation()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const onSeekRef = useRef(onSeek)
  const clipsRef = useRef(clips)
  onSeekRef.current = onSeek
  clipsRef.current = clips

  const totalDuration = clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0)
  const timelinePos = videoTimeToTimelinePos(clips, currentTime)
  const playheadPercent = totalDuration > 0 && timelinePos >= 0
    ? (timelinePos / totalDuration) * 100
    : 0

  const getTimeFromMouseEvent = useCallback((e: MouseEvent): number | null => {
    if (!containerRef.current || totalDuration <= 0) return null
    const rect = containerRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const timelinePosition = fraction * totalDuration
    return timelinePosToVideoTime(clipsRef.current, timelinePosition)
  }, [totalDuration])

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger on clip block clicks or drag end
    if ((e.target as HTMLElement).closest('[data-clip-block]')) return
    const time = getTimeFromMouseEvent(e.nativeEvent)
    if (time !== null) onSeekRef.current?.(time)
  }, [getTimeFromMouseEvent])

  // Playhead drag handlers
  useEffect(() => {
    if (!isDraggingPlayhead) return

    const handleMouseMove = (e: MouseEvent) => {
      const time = getTimeFromMouseEvent(e)
      if (time !== null) onSeekRef.current?.(time)
    }

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingPlayhead, getTimeFromMouseEvent])

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      if (dragIndex !== null && dragIndex !== toIndex) {
        onReorderClips(dragIndex, toIndex)
      }
      setDragIndex(null)
      setDragOverIndex(null)
    },
    [dragIndex, onReorderClips]
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  if (clips.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center bg-gray-800 border-t border-gray-700 text-gray-500 text-sm">
        {t('timeline.noClips')}
      </div>
    )
  }

  return (
    <div className="bg-gray-800 border-t border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
        <span className="text-xs text-gray-400 font-medium">{t('timeline.title')}</span>
        <span className="text-xs text-gray-500">
          {t('timeline.clipCount', { count: clips.length, duration: formatTime(totalDuration) })}
        </span>
      </div>

      {/* Timeline tracks */}
      <div
        ref={containerRef}
        className="relative px-4 py-3 min-h-[60px] cursor-crosshair"
        onClick={handleTimelineClick}
      >
        {/* Playhead */}
        {totalDuration > 0 && (
          <div
            className="absolute top-0 bottom-0 z-10 cursor-col-resize"
            style={{
              left: `calc(${playheadPercent}% + 1rem)`,
              width: '12px',
              marginLeft: '-6px'
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDraggingPlayhead(true)
            }}
          >
            {/* Visible line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-yellow-400 -translate-x-1/2 pointer-events-none" />
            {/* Handle */}
            <div className="absolute left-1/2 -top-0.5 -translate-x-1/2 w-3 h-2 bg-yellow-400 rounded-b-sm pointer-events-none" />
          </div>
        )}

        {/* Clip blocks */}
        <div className="flex gap-1">
          {clips.map((clip, index) => {
            const clipDuration = clip.endSec - clip.startSec
            const widthPercent = totalDuration > 0 ? (clipDuration / totalDuration) * 100 : 0
            const isSelected = clip.id === selectedClipId
            const isDragging = index === dragIndex
            const isDragOver = index === dragOverIndex

            return (
              <div
                key={clip.id}
                data-clip-block
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectClip(clip)}
                className={`
                  relative group flex items-center gap-1 px-2 py-2 rounded cursor-pointer
                  transition-all select-none min-w-[60px]
                  ${CLIP_COLORS[index % CLIP_COLORS.length]}
                  ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800' : ''}
                  ${isDragging ? 'opacity-50' : ''}
                  ${isDragOver ? 'ring-2 ring-blue-400' : ''}
                  hover:brightness-110
                `}
                style={{ flex: `${Math.max(widthPercent, 5)} 0 auto` }}
                title={`${formatTime(clip.startSec)} → ${formatTime(clip.endSec)} (${formatTime(clipDuration)})`}
              >
                <GripVertical className="w-3 h-3 text-white/40 shrink-0 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium truncate">
                    {t('timeline.clipLabel', { index: index + 1 })}
                  </div>
                  <div className="text-[10px] text-white/60 font-mono">
                    {formatTime(clip.startSec)} → {formatTime(clip.endSec)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteClip(clip.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-white/60 hover:text-red-400 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
