import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Film, Import } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../stores/useProjectStore'
import { VideoPlayer, type VideoPlayerHandle } from '../components/VideoPlayer'
import { ClipEditor } from '../components/ClipEditor'
import { Timeline } from '../components/Timeline'
import { AudioTrackPanel } from '../components/AudioTrackPanel'
import { ClipInspector } from '../components/ClipInspector'
import { useTranslation } from '../i18n'
import type { Clip } from '../types/project'

export const EditorPage: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const {
    project,
    addClip,
    removeClip,
    reorderClips,
    createProjectFromVideo,
    setError
  } = useProjectStore()

  const videoRef = useRef<VideoPlayerHandle>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [inPoint, setInPoint] = useState<number | null>(null)
  const [outPoint, setOutPoint] = useState<number | null>(null)
  const [triggerSetIn, setTriggerSetIn] = useState(0)
  const [triggerSetOut, setTriggerSetOut] = useState(0)
  const previewRafRef = useRef<number | null>(null)
  const previewEndRef = useRef<number>(0)

  const videoPath = project?.sourceVideoPath

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleLoadedMetadata = useCallback((dur: number) => {
    setDuration(dur)
  }, [])

  const handleSeek = useCallback(
    (time: number) => {
      videoRef.current?.seekTo(time)
    },
    []
  )

  const handleAddClip = useCallback(
    (startSec: number, endSec: number) => {
      if (!videoPath) return
      const clip: Clip = {
        id: crypto.randomUUID(),
        sourcePath: videoPath,
        startSec,
        endSec,
        timelineStart: 0,
        timelineEnd: endSec - startSec,
        volume: 1
      }
      addClip(clip)
    },
    [videoPath, addClip]
  )

  // I/O keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'i':
        case 'I':
          e.preventDefault()
          setTriggerSetIn((prev) => prev + 1)
          break
        case 'o':
        case 'O':
          e.preventDefault()
          setTriggerSetOut((prev) => prev + 1)
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Preview using requestAnimationFrame instead of setTimeout
  const handlePreviewTrim = useCallback(
    (startSec: number, endSec: number) => {
      if (!videoRef.current) return
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)

      previewEndRef.current = endSec
      videoRef.current.seekTo(startSec)
      videoRef.current.play()

      const checkEnd = () => {
        const current = videoRef.current?.getCurrentTime() ?? 0
        if (current >= previewEndRef.current) {
          videoRef.current?.pause()
          previewRafRef.current = null
          return
        }
        previewRafRef.current = requestAnimationFrame(checkEnd)
      }
      previewRafRef.current = requestAnimationFrame(checkEnd)
    },
    []
  )

  // Cleanup preview RAF on unmount
  useEffect(() => {
    return () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
    }
  }, [])

  const handleSelectClip = useCallback(
    (clip: Clip) => {
      setSelectedClipId(clip.id)
      videoRef.current?.seekTo(clip.startSec)
    },
    []
  )

  const handleDeleteClip = useCallback(
    (id: string) => {
      removeClip(id)
      if (selectedClipId === id) {
        setSelectedClipId(null)
      }
    },
    [removeClip, selectedClipId]
  )

  const handleDeselectClip = useCallback(() => {
    setSelectedClipId(null)
  }, [])

  const clips = project?.clips ?? []
  const selectedClipIndex = selectedClipId
    ? clips.findIndex((c) => c.id === selectedClipId)
    : -1
  const selectedClip = selectedClipIndex >= 0 ? clips[selectedClipIndex] : null

  const handleImportVideo = useCallback(async () => {
    try {
      const filePath = await window.electronAPI.openVideoDialog()
      if (filePath) {
        const videoName = filePath.split(/[\\/]/).pop() || t('editor.unknownVideo')
        createProjectFromVideo(filePath, videoName)
      }
    } catch {
      setError(t('editor.videoFailed'))
    }
  }, [createProjectFromVideo, setError, t])

  // No video loaded — show import prompt
  if (!videoPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Film className="w-16 h-16 text-cs2-text-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">{t('editor.noVideo')}</h2>
          <p className="text-cs2-text-muted mb-4">
            {t('editor.importPrompt')}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleImportVideo}
              className="flex items-center gap-2 px-4 py-2 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep rounded-lg transition-colors font-medium"
            >
              <Import className="w-4 h-4" />
              {t('editor.importVideo')}
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-cs2-elevated hover:bg-cs2-border text-gray-300 rounded-lg transition-colors"
            >
              {t('editor.backHome')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Video player - constrained so ClipEditor buttons remain visible */}
      <div className="flex-1 min-h-0 max-h-[60%] flex justify-center items-center bg-cs2-deep">
        <div className="w-full max-w-[960px] h-full">
        <VideoPlayer
          ref={videoRef}
          src={videoPath}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          inPoint={inPoint}
          outPoint={outPoint}
        />
        </div>
      </div>

      {/* Audio tracks */}
      <AudioTrackPanel />

      {/* Clip inspector */}
      <ClipInspector
        clip={selectedClip}
        clipIndex={selectedClipIndex >= 0 ? selectedClipIndex : 0}
        onSeek={handleSeek}
        onDeselect={handleDeselectClip}
      />

      {/* Clip editor */}
      <ClipEditor
        currentTime={currentTime}
        duration={duration}
        inPoint={inPoint}
        outPoint={outPoint}
        onInPointChange={setInPoint}
        onOutPointChange={setOutPoint}
        onSeek={handleSeek}
        onAddClip={handleAddClip}
        onPreviewTrim={handlePreviewTrim}
        triggerSetIn={triggerSetIn}
        triggerSetOut={triggerSetOut}
      />

      {/* Timeline */}
      <Timeline
        clips={clips}
        currentTime={currentTime}
        onSelectClip={handleSelectClip}
        onDeleteClip={handleDeleteClip}
        onReorderClips={reorderClips}
        onSeek={handleSeek}
        selectedClipId={selectedClipId}
      />
    </div>
  )
}
