import { describe, it, expect } from 'vitest'
import { useProjectStore } from '../../src/renderer/src/stores/useProjectStore'

describe('useProjectStore', () => {
  it('has correct initial state', () => {
    const state = useProjectStore.getState()
    expect(state.project).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('setProject updates project', () => {
    const { setProject } = useProjectStore.getState()
    setProject({
      id: '1',
      name: 'Test Project',
      demoPath: 'test.dem',
      cs2InstallPath: '',
      demoName: '',
      createdAt: Date.now(),
      highlights: [],
      clips: [],
      audioTracks: [],
      gameInfo: null,
      status: 'parsed',
      error: null
    })

    const state = useProjectStore.getState()
    expect(state.project).not.toBeNull()
    expect(state.project?.name).toBe('Test Project')
  })

  it('clearProject resets state', () => {
    const { clearProject } = useProjectStore.getState()
    clearProject()

    const state = useProjectStore.getState()
    expect(state.project).toBeNull()
  })

  describe('export state', () => {
    it('has correct initial export state', () => {
      const state = useProjectStore.getState()
      expect(state.exportStatus).toBe('idle')
      expect(state.exportProgress).toBeNull()
      expect(state.exportSettings.crf).toBe(22)
      expect(state.exportSettings.outputFormat).toBe('mp4')
    })

    it('setExportStatus updates status', () => {
      const { setExportStatus } = useProjectStore.getState()
      setExportStatus('trimming')
      expect(useProjectStore.getState().exportStatus).toBe('trimming')
    })

    it('setExportProgress updates progress', () => {
      const { setExportProgress } = useProjectStore.getState()
      const progress = {
        status: 'trimming' as const,
        percent: 50,
        currentStep: 1,
        totalSteps: 3,
        stepLabel: 'Trimming clip 1/3'
      }
      setExportProgress(progress)
      expect(useProjectStore.getState().exportProgress).toEqual(progress)
    })

    it('setExportSettings merges partial settings', () => {
      const { setExportSettings } = useProjectStore.getState()
      setExportSettings({ crf: 18 })
      const state = useProjectStore.getState()
      expect(state.exportSettings.crf).toBe(18)
      expect(state.exportSettings.outputFormat).toBe('mp4') // unchanged
    })

    it('resetExport restores idle state', () => {
      const { setExportStatus, setExportProgress, resetExport } = useProjectStore.getState()
      setExportStatus('done')
      setExportProgress({
        status: 'done',
        percent: 100,
        currentStep: 3,
        totalSteps: 3,
        stepLabel: 'Done'
      })

      resetExport()
      const state = useProjectStore.getState()
      expect(state.exportStatus).toBe('idle')
      expect(state.exportProgress).toBeNull()
    })
  })
})
