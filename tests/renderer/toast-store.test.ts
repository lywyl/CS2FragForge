import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToastStore, toast } from '../../src/renderer/src/stores/useToastStore'

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has correct initial state', () => {
    const state = useToastStore.getState()
    expect(state.toasts).toEqual([])
  })

  it('addToast appends toast with auto-generated ID', () => {
    const { addToast } = useToastStore.getState()
    const id = addToast({ type: 'success', title: 'Test' })

    expect(id).toBe(Date.now().toString())
    const state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].type).toBe('success')
    expect(state.toasts[0].title).toBe('Test')
    expect(state.toasts[0].id).toBe(id)
  })

  it('addToast uses provided ID when given', () => {
    const { addToast } = useToastStore.getState()
    const id = addToast({ id: 'custom-id', type: 'error', title: 'Oops' })

    expect(id).toBe('custom-id')
    expect(useToastStore.getState().toasts[0].id).toBe('custom-id')
  })

  it('removeToast filters by ID', () => {
    const { addToast, removeToast } = useToastStore.getState()
    addToast({ id: 'a', type: 'success', title: 'A' })
    addToast({ id: 'b', type: 'error', title: 'B' })

    removeToast('a')

    const state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].id).toBe('b')
  })

  it('clearAll removes all toasts', () => {
    const { addToast, clearAll } = useToastStore.getState()
    addToast({ id: 'a', type: 'success', title: 'A' })
    addToast({ id: 'b', type: 'error', title: 'B' })

    clearAll()

    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('auto-dismisses toast after default duration (5000ms)', () => {
    const { addToast } = useToastStore.getState()
    addToast({ id: 'auto', type: 'info', title: 'Auto' })

    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(5000)

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses toast after custom duration', () => {
    const { addToast } = useToastStore.getState()
    addToast({ id: 'fast', type: 'warning', title: 'Fast', duration: 1000 })

    vi.advanceTimersByTime(999)
    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does not auto-dismiss when duration is 0', () => {
    const { addToast } = useToastStore.getState()
    addToast({ id: 'persist', type: 'error', title: 'Persist', duration: 0 })

    vi.advanceTimersByTime(10000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('clears timeout when toast is manually removed', () => {
    const { addToast, removeToast } = useToastStore.getState()
    addToast({ id: 'manual', type: 'success', title: 'Manual' })

    removeToast('manual')
    expect(useToastStore.getState().toasts).toHaveLength(0)

    // Advancing time should not cause errors
    vi.advanceTimersByTime(5000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  describe('convenience methods', () => {
    it('success adds a success toast', () => {
      const { success } = useToastStore.getState()
      const id = success('Done!', 'Operation completed')

      const state = useToastStore.getState()
      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0].type).toBe('success')
      expect(state.toasts[0].title).toBe('Done!')
      expect(state.toasts[0].message).toBe('Operation completed')
      expect(state.toasts[0].id).toBe(id)
    })

    it('error adds an error toast', () => {
      const { error } = useToastStore.getState()
      error('Failed', 'Something went wrong')

      const state = useToastStore.getState()
      expect(state.toasts[0].type).toBe('error')
      expect(state.toasts[0].title).toBe('Failed')
      expect(state.toasts[0].message).toBe('Something went wrong')
    })

    it('warning adds a warning toast', () => {
      const { warning } = useToastStore.getState()
      warning('Caution')

      const state = useToastStore.getState()
      expect(state.toasts[0].type).toBe('warning')
      expect(state.toasts[0].title).toBe('Caution')
    })

    it('info adds an info toast', () => {
      const { info } = useToastStore.getState()
      info('FYI', 'Just so you know')

      const state = useToastStore.getState()
      expect(state.toasts[0].type).toBe('info')
      expect(state.toasts[0].title).toBe('FYI')
      expect(state.toasts[0].message).toBe('Just so you know')
    })
  })

  describe('standalone toast helper', () => {
    it('success creates toast via standalone helper', () => {
      toast.success('Standalone', 'via helper')

      const state = useToastStore.getState()
      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0].type).toBe('success')
      expect(state.toasts[0].title).toBe('Standalone')
    })

    it('error creates toast via standalone helper', () => {
      toast.error('Oops')

      expect(useToastStore.getState().toasts[0].type).toBe('error')
    })

    it('warning creates toast via standalone helper', () => {
      toast.warning('Heads up')

      expect(useToastStore.getState().toasts[0].type).toBe('warning')
    })

    it('info creates toast via standalone helper', () => {
      toast.info('Note')

      expect(useToastStore.getState().toasts[0].type).toBe('info')
    })
  })
})
