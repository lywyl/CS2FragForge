import React, { useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, FileVideo, Loader2, Film } from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { MergeProgressOverlay } from '../components/MergeProgressOverlay'
import { useTranslation } from '../i18n'

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate()
  const {
    setProject, setLoading, setError, createProjectFromVideo,
    createProjectFromMultipleVideos,
    mergeStatus, mergeProgress, setMergeProgress, setMergeStatus,
    isLoading, error
  } = useProjectStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const { t } = useTranslation()

  const handleCancelMerge = useCallback(async () => {
    await window.electronAPI.videoMergeCancel()
    setMergeStatus('idle')
    setMergeProgress(null)
  }, [setMergeStatus, setMergeProgress])

  // Subscribe to merge progress
  useEffect(() => {
    if (mergeStatus !== 'merging') return
    const unsubscribe = window.electronAPI.onVideoMergeProgress((progress) => {
      setMergeProgress(progress)
      if (progress.status === 'done') {
        setMergeStatus('done')
        navigate('/editor')
      }
      if (progress.status === 'error') setMergeStatus('error')
      if (progress.status === 'cancelled') setMergeStatus('idle')
    })
    return unsubscribe
  }, [mergeStatus, setMergeProgress, setMergeStatus, navigate])

  const handleFile = useCallback(
    async (filePath: string) => {
      if (!filePath.endsWith('.dem')) {
        setError(t('welcome.error.notDem'))
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Ensure Python backend is running
        const isHealthy = await window.electronAPI.pythonHealth()
        if (!isHealthy) {
          await window.electronAPI.pythonStart()
        }

        // Parse demo and detect highlights
        const [highlightsResult, gameInfoResult] = await Promise.all([
          window.electronAPI.demoDetectHighlights(filePath),
          window.electronAPI.demoGetGameInfo(filePath)
        ])

        const highlights = (highlightsResult as Array<Record<string, unknown>>).map((h, i) => ({
          id: `hl-${i}`,
          type: h.type as string,
          playerName: h.player_name as string,
          playerSteamId: h.player_steamid as string,
          playerUserId: h.player_userid as number,
          round: h.round as number,
          tickStart: h.tick_start as number,
          tickEnd: h.tick_end as number,
          killCount: h.kill_count as number,
          weapons: h.weapons as string[],
          score: h.score as number,
          headshotCount: h.headshot_count as number | undefined,
          killTicks: h.kill_ticks as number[] | undefined,
          killDetails: (h.kill_details as Array<Record<string, unknown>> | undefined)?.map(kd => ({
            tick: kd.tick as number,
            victimName: kd.victim_name as string,
            victimSteamId: kd.victim_steamid as string,
            victimUserId: kd.victim_userid as number,
            weapon: kd.weapon as string,
            headshot: kd.headshot as boolean,
          })),
          selected: false
        }))

        const gameInfo = {
          mapName: (gameInfoResult as Record<string, unknown>).map_name as string,
          tickRate: (gameInfoResult as Record<string, unknown>).tick_rate as number,
          totalCountedRounds: (gameInfoResult as Record<string, unknown>).total_counted_rounds as number,
          players: ((gameInfoResult as Record<string, unknown>).players as Array<Record<string, unknown>>).map(
            (p) => ({
              name: p.name as string,
              steamId: p.steamid as string,
              team: p.team as string,
              kills: p.kills as number,
              deaths: p.deaths as number
            })
          )
        }

        const demoName = filePath.split(/[\\/]/).pop() || t('welcome.error.unknownDemo')

        setProject({
          id: crypto.randomUUID(),
          demoPath: filePath,
          demoName,
          cs2InstallPath: '',
          name: demoName.replace('.dem', ''),
          createdAt: Date.now(),
          highlights,
          clips: [],
          audioTracks: [],
          gameInfo,
          status: 'parsed',
          error: null
        })

        navigate('/project')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('welcome.error.parseFailed'))
      } finally {
        setLoading(false)
      }
    },
    [setProject, setLoading, setError, navigate, t]
  )

  const handleOpenFile = useCallback(async () => {
    try {
      const filePath = await window.electronAPI.openDialog({
        filters: [{ name: 'Demo Files', extensions: ['dem'] }]
      })
      if (filePath) {
        await handleFile(filePath)
      }
    } catch {
      setError(t('welcome.error.dialogFailed'))
    }
  }, [handleFile, setError, t])

  const handleImportVideo = useCallback(async () => {
    try {
      const filePaths = await window.electronAPI.openVideoDialogMulti()
      if (!filePaths || filePaths.length === 0) return

      if (filePaths.length === 1) {
        const videoName = filePaths[0].split(/[\\/]/).pop() || t('welcome.error.unknownVideo')
        createProjectFromVideo(filePaths[0], videoName)
        navigate('/editor')
      } else {
        await createProjectFromMultipleVideos(filePaths)
        // Navigation happens in merge progress subscription when done
      }
    } catch {
      setError(t('welcome.error.videoFailed'))
    }
  }, [createProjectFromVideo, createProjectFromMultipleVideos, navigate, setError, t])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        const file = files[0]
        const filePath = window.electronAPI.getDroppedFilePath(file)
        if (filePath) {
          handleFile(filePath)
        }
      }
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  return (
    <div className="flex items-center justify-center h-full">
      {/* Merge progress overlay */}
      {mergeStatus === 'merging' && (
        <MergeProgressOverlay progress={mergeProgress} onCancel={handleCancelMerge} />
      )}

      <div className="text-center max-w-lg">
        <div className="mb-6">
          <FileVideo className="w-16 h-16 text-cs2-gold mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">{t('welcome.title')}</h1>
          <p className="text-cs2-text-muted">
            {t('welcome.description')}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer ${
            isDragOver
              ? 'border-cs2-gold bg-cs2-gold/10'
              : 'border-gray-600 hover:border-cs2-gold/50 bg-cs2-surface/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleOpenFile}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-cs2-gold animate-spin" />
              <p className="text-gray-300">{t('welcome.parsing')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <FolderOpen className="w-10 h-10 text-cs2-text-muted" />
              <p className="text-gray-300 font-medium">
                {t('welcome.dropHere', { ext: '.dem' })}
              </p>
              <p className="text-gray-500 text-sm">{t('welcome.orClick')}</p>
            </div>
          )}
        </div>

        <div className="mt-6 text-cs2-text-muted text-xs">
          <p>{t('welcome.supports')}</p>
        </div>

        <div className="mt-4">
          <button
            onClick={handleImportVideo}
            className="flex items-center gap-2 mx-auto px-4 py-2 bg-cs2-elevated/50 hover:bg-cs2-elevated border border-cs2-border hover:border-cs2-gold/50 rounded-lg text-gray-300 hover:text-white text-sm transition-colors"
          >
            <Film className="w-4 h-4" />
            <span>{t('welcome.importVideo')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
