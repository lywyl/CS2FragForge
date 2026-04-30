import React, { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

const FRAME_STEP = 1 / 30

interface VideoPlayerProps {
  src: string
  onTimeUpdate?: (currentTime: number) => void
  onLoadedMetadata?: (duration: number) => void
  onSeek?: (time: number) => void
  inPoint?: number | null
  outPoint?: number | null
}

export interface VideoPlayerHandle {
  seekTo: (time: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  getCurrentTime: () => number
  getDuration: () => number
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ src, onTimeUpdate, onLoadedMetadata, onSeek, inPoint, outPoint }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)

    const videoSrc = src.startsWith('/') || src.match(/^[A-Z]:\\/i)
      ? `local-video://${encodeURIComponent(src)}`
      : src

    useImperativeHandle(ref, () => ({
      seekTo: (time: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = time
          setCurrentTime(time)
        }
      },
      play: () => videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      togglePlay: () => {
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play()
          } else {
            videoRef.current.pause()
          }
        }
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0
    }))

    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current) {
        const t = videoRef.current.currentTime
        setCurrentTime(t)
        onTimeUpdate?.(t)
      }
    }, [onTimeUpdate])

    const handleLoadedMetadata = useCallback(() => {
      if (videoRef.current) {
        setDuration(videoRef.current.duration)
        onLoadedMetadata?.(videoRef.current.duration)
      }
    }, [onLoadedMetadata])

    const handlePlay = useCallback(() => setIsPlaying(true), [])
    const handlePause = useCallback(() => setIsPlaying(false), [])

    const handleSeekChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value)
        if (videoRef.current) {
          videoRef.current.currentTime = time
          setCurrentTime(time)
        }
      },
      []
    )

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const vol = parseFloat(e.target.value)
      setVolume(vol)
      if (videoRef.current) {
        videoRef.current.volume = vol
      }
      setIsMuted(vol === 0)
    }, [])

    const toggleMute = useCallback(() => {
      if (videoRef.current) {
        const newMuted = !isMuted
        videoRef.current.muted = newMuted
        setIsMuted(newMuted)
      }
    }, [isMuted])

    const togglePlay = useCallback(() => {
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play()
        } else {
          videoRef.current.pause()
        }
      }
    }, [])

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return
        switch (e.key) {
          case ' ':
            e.preventDefault()
            togglePlay()
            break
          case 'ArrowLeft':
            e.preventDefault()
            if (videoRef.current) {
              videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
            }
            break
          case 'ArrowRight':
            e.preventDefault()
            if (videoRef.current) {
              videoRef.current.currentTime = Math.min(
                videoRef.current.duration,
                videoRef.current.currentTime + 5
              )
            }
            break
          case ',':
            e.preventDefault()
            if (videoRef.current) {
              videoRef.current.pause()
              videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - FRAME_STEP)
              setCurrentTime(videoRef.current.currentTime)
              onTimeUpdate?.(videoRef.current.currentTime)
            }
            break
          case '.':
            e.preventDefault()
            if (videoRef.current) {
              videoRef.current.pause()
              videoRef.current.currentTime = Math.min(
                videoRef.current.duration,
                videoRef.current.currentTime + FRAME_STEP
              )
              setCurrentTime(videoRef.current.currentTime)
              onTimeUpdate?.(videoRef.current.currentTime)
            }
            break
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [togglePlay, onTimeUpdate])

    return (
      <div className="flex flex-col h-full bg-black rounded-lg overflow-hidden">
        {/* Video element */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={handlePlay}
            onPause={handlePause}
            onClick={togglePlay}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-900">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="text-white hover:text-blue-400 transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          {/* Time display */}
          <span className="text-xs text-gray-400 font-mono min-w-[80px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Seek bar with in/out range overlay */}
          <div className="relative flex-1 h-4 flex items-center">
            {inPoint != null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 left-0 bg-gray-600/40 pointer-events-none rounded-l"
                style={{ width: `${(inPoint / duration) * 100}%` }}
              />
            )}
            {outPoint != null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 right-0 bg-gray-600/40 pointer-events-none rounded-r"
                style={{ width: `${((duration - outPoint) / duration) * 100}%` }}
              />
            )}
            {inPoint != null && outPoint != null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-green-500/15 pointer-events-none"
                style={{
                  left: `${(inPoint / duration) * 100}%`,
                  width: `${((outPoint - inPoint) / duration) * 100}%`
                }}
              />
            )}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={currentTime}
              onChange={handleSeekChange}
              className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Volume */}
          <button
            onClick={toggleMute}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-gray-400 [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
      </div>
    )
  }
)

VideoPlayer.displayName = 'VideoPlayer'
