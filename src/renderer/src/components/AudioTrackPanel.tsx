import React, { useCallback } from 'react'
import { Music, Plus, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { useTranslation } from '../i18n'

export const AudioTrackPanel: React.FC = () => {
  const { t } = useTranslation()
  const audioTracks = useProjectStore((s) => s.project?.audioTracks ?? [])
  const addAudioTrack = useProjectStore((s) => s.addAudioTrack)
  const removeAudioTrack = useProjectStore((s) => s.removeAudioTrack)
  const updateAudioTrack = useProjectStore((s) => s.updateAudioTrack)

  const handleImport = useCallback(async () => {
    const filePath = await window.electronAPI.openDialog({
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (!filePath) return

    addAudioTrack({
      id: crypto.randomUUID(),
      sourcePath: filePath,
      volume: 1,
      startSec: 0,
      endSec: 0
    })
  }, [addAudioTrack])

  const handleVolumeChange = useCallback(
    (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
      updateAudioTrack(id, { volume: parseFloat(e.target.value) })
    },
    [updateAudioTrack]
  )

  return (
    <div className="flex flex-col gap-2 px-4 py-3 bg-gray-800 border-t border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-gray-300">
            {t('editor.audioTracks')} ({audioTracks.length})
          </span>
        </div>
        <button
          onClick={handleImport}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          {t('editor.importAudio')}
        </button>
      </div>

      {audioTracks.length === 0 ? (
        <p className="text-xs text-gray-500">{t('editor.noAudioTracks')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {audioTracks.map((track) => {
            const name = track.sourcePath.split(/[\\/]/).pop() || track.sourcePath
            return (
              <div
                key={track.id}
                className="flex items-center gap-3 px-2 py-1.5 bg-gray-900 rounded"
              >
                <Music className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="text-xs text-gray-300 truncate flex-1 min-w-0" title={track.sourcePath}>
                  {name}
                </span>

                {/* Volume */}
                <VolumeX className="w-3 h-3 text-gray-500 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={track.volume}
                  onChange={(e) => handleVolumeChange(track.id, e)}
                  className="w-20 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-full"
                />
                <Volume2 className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-500 font-mono w-8 text-right">
                  {Math.round(track.volume * 100)}%
                </span>

                {/* Remove */}
                <button
                  onClick={() => removeAudioTrack(track.id)}
                  className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                  title={t('editor.removeAudio')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
