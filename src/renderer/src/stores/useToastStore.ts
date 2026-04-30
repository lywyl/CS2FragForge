import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

export interface ToastStoreInterface {
  toasts: Toast[]

  addToast: (toast: Omit<Toast, 'id'> & { id?: string }) => string
  removeToast: (id: string) => void
  clearAll: () => void

  success: (title: string, message?: string) => string
  error: (title: string, message?: string) => string
  warning: (title: string, message?: string) => string
  info: (title: string, message?: string) => string
}

const DEFAULT_DURATION = 5000

// Module-level timeout storage (outside Zustand state to avoid serialization issues)
const timeoutRefs = new Map<string, ReturnType<typeof setTimeout>>()

function clearToastTimeout(id: string): void {
  const timeout = timeoutRefs.get(id)
  if (timeout) {
    clearTimeout(timeout)
    timeoutRefs.delete(id)
  }
}

export const useToastStore = create<ToastStoreInterface>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = toast.id ?? Date.now().toString()
    const duration = toast.duration ?? DEFAULT_DURATION

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }]
    }))

    if (duration > 0) {
      const timeout = setTimeout(() => {
        get().removeToast(id)
      }, duration)
      timeoutRefs.set(id, timeout)
    }

    return id
  },

  removeToast: (id) => {
    clearToastTimeout(id)
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  },

  clearAll: () => {
    for (const id of timeoutRefs.keys()) {
      clearToastTimeout(id)
    }
    set({ toasts: [] })
  },

  success: (title, message) => {
    return get().addToast({ type: 'success', title, message })
  },

  error: (title, message) => {
    return get().addToast({ type: 'error', title, message })
  },

  warning: (title, message) => {
    return get().addToast({ type: 'warning', title, message })
  },

  info: (title, message) => {
    return get().addToast({ type: 'info', title, message })
  }
}))

/** Standalone toast helper for non-React usage */
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().success(title, message),
  error: (title: string, message?: string) => useToastStore.getState().error(title, message),
  warning: (title: string, message?: string) => useToastStore.getState().warning(title, message),
  info: (title: string, message?: string) => useToastStore.getState().info(title, message)
}
