import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Map,
  Users,
  Trophy,
  Filter,
  ChevronDown,
  Play,
  Clock,
  X,
  Swords,
  Shield,
  Target
} from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { useTranslation } from '../i18n'
import type { HighlightType } from '../types/project'

const HIGHLIGHT_TYPE_ICONS: Record<HighlightType, React.ReactNode> = {
  '3K': <Swords className="w-4 h-4" />,
  '4K': <Swords className="w-4 h-4" />,
  ACE: <Trophy className="w-4 h-4" />,
  CLUTCH: <Shield className="w-4 h-4" />,
  ECO_WIN: <Target className="w-4 h-4" />,
  CUSTOM: <Star className="w-4 h-4" />
}

const HIGHLIGHT_TYPE_COLORS: Record<HighlightType, string> = {
  '3K': 'bg-cs2-gold/10 text-cs2-gold border-cs2-gold/30',
  '4K': 'bg-purple-600/20 text-purple-400 border-purple-600/40',
  ACE: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/40',
  CLUTCH: 'bg-red-600/20 text-red-400 border-red-600/40',
  ECO_WIN: 'bg-green-600/20 text-green-400 border-green-600/40',
  CUSTOM: 'bg-gray-600/20 text-gray-400 border-gray-600/40'
}

function Star(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function ScoreBar({ score }: { score: number }) {
  const percentage = Math.round(score * 100)
  const color =
    score >= 0.9 ? 'bg-yellow-500' : score >= 0.8 ? 'bg-purple-500' : score >= 0.7 ? 'bg-blue-500' : 'bg-gray-500'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-cs2-elevated rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-xs text-cs2-text-muted w-8">{(score * 10).toFixed(1)}</span>
    </div>
  )
}

export const ProjectPage: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const {
    project,
    selectedPlayerFilter,
    selectedTypeFilter,
    setSelectedPlayerFilter,
    setSelectedTypeFilter,
    filteredHighlights
  } = useProjectStore()

  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'score' | 'round' | 'type'>('score')

  const highlights = useMemo(() => {
    const filtered = filteredHighlights()
    return [...filtered].sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score
      if (sortBy === 'round') return a.round - b.round
      return a.type.localeCompare(b.type)
    })
  }, [filteredHighlights, sortBy])

  const uniquePlayers = useMemo(() => {
    if (!project) return []
    return [...new Set(project.highlights.map((h) => h.playerName))]
  }, [project])

  const availableTypes: HighlightType[] = useMemo(() => {
    if (!project) return []
    return [...new Set(project.highlights.map((h) => h.type))]
  }, [project])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-cs2-text-muted">{t('project.noDemo')}</p>
      </div>
    )
  }

  const { gameInfo, demoName } = project

  return (
    <div className="h-full flex flex-col">
      {/* Demo Info Header */}
      <div className="border-b border-cs2-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{demoName}</h2>
            {gameInfo && (
              <div className="flex items-center gap-4 mt-1 text-sm text-cs2-text-muted">
                <span className="flex items-center gap-1">
                  <Map className="w-3.5 h-3.5" />
                  {gameInfo.mapName}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {t('project.tick', { rate: gameInfo.tickRate })}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {t('project.players', { count: gameInfo.players.length })}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-sm bg-cs2-elevated hover:bg-cs2-border rounded-lg text-gray-300 transition-colors"
              onClick={() => {
                useProjectStore.getState().clearProject()
                navigate('/')
              }}
            >
              <X className="w-4 h-4 inline mr-1" />
              {t('project.close')}
            </button>
            <button
              className="px-4 py-1.5 text-sm bg-cs2-gold hover:bg-cs2-gold-dark rounded-lg text-cs2-deep font-medium transition-colors disabled:opacity-50"
              disabled={highlights.filter((h) => h.selected).length === 0}
              title={t('project.recordTooltip')}
            >
              <Play className="w-4 h-4 inline mr-1" />
              {t('project.recordHighlights')}
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Highlights */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-cs2-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-300">
              {t('project.highlightsFound', { count: highlights.length })}
            </span>
            <button
              className={`flex items-center gap-1 px-3 py-1 text-sm rounded-lg transition-colors ${
                showFilters ? 'bg-cs2-gold/10 text-cs2-gold' : 'bg-cs2-surface text-cs2-text-muted hover:text-gray-300'
              }`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
              {t('project.filters')}
              <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('project.sort')}</span>
            {(['score', 'round', 'type'] as const).map((s) => (
              <button
                key={s}
                className={`px-2 py-0.5 text-xs rounded ${
                  sortBy === s ? 'bg-cs2-gold/20 text-cs2-gold' : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setSortBy(s)}
              >
                {t(`project.sort.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="px-6 py-3 border-b border-cs2-border bg-cs2-surface/50">
            <div className="flex gap-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('project.player')}</label>
                <select
                  className="bg-cs2-deep border border-cs2-border rounded px-2 py-1 text-sm text-gray-300"
                  value={selectedPlayerFilter || ''}
                  onChange={(e) => setSelectedPlayerFilter(e.target.value || null)}
                >
                  <option value="">{t('project.allPlayers')}</option>
                  {uniquePlayers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('project.type')}</label>
                <div className="flex gap-1.5">
                  {availableTypes.map((tp) => (
                    <button
                      key={tp}
                      className={`px-2 py-0.5 text-xs rounded ${
                        selectedTypeFilter.includes(tp)
                          ? 'bg-cs2-gold/20 text-cs2-gold'
                          : 'bg-cs2-elevated text-gray-400 hover:text-gray-300'
                      }`}
                      onClick={() => {
                        const newTypes = selectedTypeFilter.includes(tp)
                          ? selectedTypeFilter.filter((x) => x !== tp)
                          : [...selectedTypeFilter, tp]
                        setSelectedTypeFilter(newTypes)
                      }}
                    >
                      {tp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Highlight Cards List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {highlights.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">{t('project.noHighlights')}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {highlights.map((h) => (
                <div
                  key={h.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-colors cursor-pointer ${
                    h.selected
                      ? 'bg-cs2-gold/10 border-cs2-gold/30'
                      : 'bg-cs2-surface/50 border-cs2-border hover:border-cs2-text-muted'
                  }`}
                  onClick={() => useProjectStore.getState().toggleHighlightSelection(h.id)}
                >
                  {/* Type Badge */}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${
                      HIGHLIGHT_TYPE_COLORS[h.type as HighlightType] || HIGHLIGHT_TYPE_COLORS.CUSTOM
                    }`}
                  >
                    {HIGHLIGHT_TYPE_ICONS[h.type as HighlightType] || HIGHLIGHT_TYPE_ICONS.CUSTOM}
                    {h.type}
                  </div>

                  {/* Player & Round */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{h.playerName}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('project.roundKill', {
                        round: h.round,
                        count: h.killCount,
                        hs: h.headshotCount !== undefined && h.headshotCount > 0 ? ` • ${h.headshotCount} HS` : ''
                      })}
                    </div>
                  </div>

                  {/* Weapons */}
                  <div className="hidden sm:flex gap-1">
                    {h.weapons.slice(0, 3).map((w, i) => (
                      <span key={i} className="text-xs bg-cs2-elevated px-1.5 py-0.5 rounded text-gray-300">
                        {w}
                      </span>
                    ))}
                  </div>

                  {/* Score */}
                  <ScoreBar score={h.score} />

                  {/* Tick Range */}
                  <div className="text-xs text-gray-500 text-right whitespace-nowrap">
                    {h.tickStart.toLocaleString()} → {h.tickEnd.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
