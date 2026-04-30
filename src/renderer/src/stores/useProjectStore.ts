import { create } from 'zustand'
import { Project, Highlight, Clip, AudioTrack, GameInfo, ProjectStatus } from '../types/project'
import type { ExportStatus, ExportProgress, ExportSettings } from '../../../shared/export-types'
import { DEFAULT_EXPORT_SETTINGS } from '../../../shared/export-types'

interface ProjectState {
  project: Project | null
  isLoading: boolean
  error: string | null

  // Project lifecycle
  setProject: (project: Project) => void
  clearProject: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setStatus: (status: ProjectStatus) => void

  // Highlights
  setHighlights: (highlights: Highlight[]) => void
  toggleHighlightSelection: (id: string) => void
  selectAllHighlights: () => void
  deselectAllHighlights: () => void

  // Clips
  setClips: (clips: Clip[]) => void
  addClip: (clip: Clip) => void
  removeClip: (id: string) => void
  updateClip: (id: string, updates: Partial<Clip>) => void
  reorderClips: (fromIndex: number, toIndex: number) => void

  // Video project
  createProjectFromVideo: (videoPath: string, videoName: string) => void

  // Audio tracks
  addAudioTrack: (track: AudioTrack) => void
  removeAudioTrack: (id: string) => void
  updateAudioTrack: (id: string, updates: Partial<AudioTrack>) => void

  // Game info
  setGameInfo: (gameInfo: GameInfo) => void

  // Filters
  selectedPlayerFilter: string | null
  selectedTypeFilter: HighlightType[]
  setSelectedPlayerFilter: (player: string | null) => void
  setSelectedTypeFilter: (types: HighlightType[]) => void
  filteredHighlights: () => Highlight[]

  // Export
  exportStatus: ExportStatus
  exportProgress: ExportProgress | null
  exportSettings: ExportSettings
  setExportStatus: (status: ExportStatus) => void
  setExportProgress: (progress: ExportProgress | null) => void
  setExportSettings: (settings: Partial<ExportSettings>) => void
  resetExport: () => void

  // Project persistence
  saveProject: () => Promise<string | null>
  loadProject: () => Promise<boolean>
}

type HighlightType = Highlight['type']

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  isLoading: false,
  error: null,
  selectedPlayerFilter: null,
  selectedTypeFilter: [],
  exportStatus: 'idle',
  exportProgress: null,
  exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

  setProject: (project) => set({ project, error: null }),
  clearProject: () =>
    set({
      project: null,
      error: null,
      selectedPlayerFilter: null,
      selectedTypeFilter: []
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setStatus: (status) =>
    set((state) => ({
      project: state.project ? { ...state.project, status } : null
    })),

  setHighlights: (highlights) =>
    set((state) => ({
      project: state.project
        ? { ...state.project, highlights, status: 'parsed' }
        : null
    })),

  toggleHighlightSelection: (id) =>
    set((state) => {
      if (!state.project) return {}
      const highlights = state.project.highlights.map((h) =>
        h.id === id ? { ...h, selected: !h.selected } : h
      )
      return { project: { ...state.project, highlights } }
    }),

  selectAllHighlights: () =>
    set((state) => {
      if (!state.project) return {}
      const highlights = state.project.highlights.map((h) => ({
        ...h,
        selected: true
      }))
      return { project: { ...state.project, highlights } }
    }),

  deselectAllHighlights: () =>
    set((state) => {
      if (!state.project) return {}
      const highlights = state.project.highlights.map((h) => ({
        ...h,
        selected: false
      }))
      return { project: { ...state.project, highlights } }
    }),

  setClips: (clips) =>
    set((state) => ({
      project: state.project ? { ...state.project, clips } : null
    })),

  addClip: (clip) =>
    set((state) => ({
      project: state.project
        ? { ...state.project, clips: [...state.project.clips, clip] }
        : null
    })),

  removeClip: (id) =>
    set((state) => ({
      project: state.project
        ? { ...state.project, clips: state.project.clips.filter((c) => c.id !== id) }
        : null
    })),

  updateClip: (id, updates) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            clips: state.project.clips.map((c) => (c.id === id ? { ...c, ...updates } : c))
          }
        : null
    })),

  reorderClips: (fromIndex, toIndex) =>
    set((state) => {
      if (!state.project) return {}
      const clips = [...state.project.clips]
      const [moved] = clips.splice(fromIndex, 1)
      clips.splice(toIndex, 0, moved)
      return { project: { ...state.project, clips } }
    }),

  createProjectFromVideo: (videoPath, videoName) => {
    const project: Project = {
      id: crypto.randomUUID(),
      demoPath: '',
      demoName: videoName,
      cs2InstallPath: '',
      name: videoName,
      createdAt: Date.now(),
      highlights: [],
      clips: [],
      audioTracks: [],
      gameInfo: null,
      status: 'edited',
      error: null,
      sourceVideoPath: videoPath
    }
    set({ project, error: null })
  },

  addAudioTrack: (track) =>
    set((state) => ({
      project: state.project
        ? { ...state.project, audioTracks: [...state.project.audioTracks, track] }
        : null
    })),

  removeAudioTrack: (id) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            audioTracks: state.project.audioTracks.filter((t) => t.id !== id)
          }
        : null
    })),

  updateAudioTrack: (id, updates) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            audioTracks: state.project.audioTracks.map((t) =>
              t.id === id ? { ...t, ...updates } : t
            )
          }
        : null
    })),

  setGameInfo: (gameInfo) =>
    set((state) => ({
      project: state.project ? { ...state.project, gameInfo } : null
    })),

  setSelectedPlayerFilter: (player) => set({ selectedPlayerFilter: player }),
  setSelectedTypeFilter: (types) => set({ selectedTypeFilter: types }),

  filteredHighlights: () => {
    const { project, selectedPlayerFilter, selectedTypeFilter } = get()
    if (!project) return []
    return project.highlights.filter((h) => {
      if (selectedPlayerFilter && h.playerName !== selectedPlayerFilter) return false
      if (selectedTypeFilter.length > 0 && !selectedTypeFilter.includes(h.type)) return false
      return true
    })
  },

  // Export
  setExportStatus: (exportStatus) => set({ exportStatus }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setExportSettings: (partial) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...partial }
    })),
  resetExport: () => set({ exportStatus: 'idle', exportProgress: null }),

  // Project persistence
  saveProject: async () => {
    const { project } = get()
    if (!project) return null
    const filePath = await window.electronAPI.projectSave(project as unknown as Record<string, unknown>)
    return filePath
  },
  loadProject: async () => {
    const data = await window.electronAPI.projectLoad()
    if (!data) return false
    set({ project: data as unknown as Project, error: null })
    return true
  }
}))