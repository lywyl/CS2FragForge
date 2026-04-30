import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../src/renderer/src/stores/useProjectStore'

describe('useProjectStore - recording state', () => {
  beforeEach(() => {
    useProjectStore.getState().resetRecording()
  })

  it('should have initial recording state as idle', () => {
    const state = useProjectStore.getState()
    expect(state.recordingStatus).toBe('idle')
    expect(state.recordingProgress).toBeNull()
    expect(state.recordingResult).toBeNull()
  })

  it('should update recordingStatus', () => {
    useProjectStore.getState().setRecordingStatus('preparing')
    expect(useProjectStore.getState().recordingStatus).toBe('preparing')
  })

  it('should update recordingProgress', () => {
    const progress = {
      status: 'recording' as const,
      percent: 50,
      currentHighlight: 1,
      totalHighlights: 3,
      highlightStatus: 'recording' as const,
      stepLabel: 'Recording...'
    }
    useProjectStore.getState().setRecordingProgress(progress)
    expect(useProjectStore.getState().recordingProgress).toEqual(progress)
  })

  it('should update recordingResult', () => {
    const result = {
      success: true,
      clips: [
        {
          highlightId: 'hl-1',
          outputPath: 'D:\\clips\\test.mp4',
          duration: 15,
          success: true
        }
      ]
    }
    useProjectStore.getState().setRecordingResult(result)
    expect(useProjectStore.getState().recordingResult).toEqual(result)
  })

  it('should reset recording state', () => {
    useProjectStore.getState().setRecordingStatus('done')
    useProjectStore.getState().setRecordingProgress({
      status: 'done',
      percent: 100,
      currentHighlight: 1,
      totalHighlights: 1,
      highlightStatus: 'done',
      stepLabel: 'Done'
    })
    useProjectStore.getState().setRecordingResult({ success: true, clips: [] })

    useProjectStore.getState().resetRecording()

    const state = useProjectStore.getState()
    expect(state.recordingStatus).toBe('idle')
    expect(state.recordingProgress).toBeNull()
    expect(state.recordingResult).toBeNull()
  })
})
