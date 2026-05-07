import type { MergeProgress } from '../../../shared/merge-types'

interface MergeProgressOverlayProps {
  progress: MergeProgress | null
  onCancel: () => void
}

export function MergeProgressOverlay({ progress, onCancel }: MergeProgressOverlayProps) {
  const percent = progress?.percent ?? 0
  const stepLabel = progress?.stepLabel ?? 'Preparing...'
  const status = progress?.status ?? 'pending'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-2">Merging Videos</h2>
        <p className="text-gray-400 text-sm mb-6">
          Please wait while videos are being merged...
        </p>

        {/* Progress bar */}
        <div className="w-full bg-gray-700 rounded-full h-3 mb-3 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>

        {/* Status text */}
        <div className="flex justify-between items-center mb-6">
          <span className="text-gray-300 text-sm">{stepLabel}</span>
          <span className="text-white font-mono text-sm">{Math.round(percent)}%</span>
        </div>

        {/* Error state */}
        {status === 'error' && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{stepLabel}</p>
          </div>
        )}

        {/* Cancel button */}
        {status !== 'done' && status !== 'error' && status !== 'cancelled' && (
          <button
            onClick={onCancel}
            className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
        )}

        {/* Done state */}
        {status === 'done' && (
          <div className="text-center">
            <div className="text-green-400 text-sm font-medium">Merge complete!</div>
          </div>
        )}
      </div>
    </div>
  )
}
