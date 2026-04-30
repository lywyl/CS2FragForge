import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useToastStore, type Toast } from '../stores/useToastStore'

const BORDER_COLOR: Record<Toast['type'], string> = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  warning: 'border-l-cs2-gold',
  info: 'border-l-blue-500'
}

const PROGRESS_COLOR: Record<Toast['type'], string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-cs2-gold',
  info: 'bg-blue-500'
}

const DEFAULT_DURATION = 5000

function ToastCard({ toast }: { toast: Toast }): React.JSX.Element {
  const removeToast = useToastStore((s) => s.removeToast)
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(100)

  const duration = toast.duration ?? DEFAULT_DURATION

  useEffect(() => {
    // Trigger enter animation on next frame
    const showTimer = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(showTimer)
  }, [])

  useEffect(() => {
    if (!visible) return

    const startTime = Date.now()

    const frame = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining > 0) {
        rafId = requestAnimationFrame(frame)
      }
    }

    let rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [visible, duration])

  const handleDismiss = (): void => {
    setVisible(false)
    // Allow exit animation before removing
    setTimeout(() => removeToast(toast.id), 300)
  }

  return (
    <div
      className={[
        'relative p-3 rounded-lg shadow-lg border-l-4',
        'bg-cs2-surface',
        BORDER_COLOR[toast.type],
        'transition-all duration-300',
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      ].join(' ')}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      <div className="text-sm font-medium text-white pr-6">{toast.title}</div>

      {toast.message && (
        <div className="text-xs text-gray-400 mt-1">{toast.message}</div>
      )}

      {/* Auto-dismiss progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg overflow-hidden">
        <div
          className={['h-full transition-[width] duration-100 ease-linear', PROGRESS_COLOR[toast.type]].join(' ')}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}