import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useProjectStore } from '../stores/useProjectStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { Highlight } from '../types/project'

interface HighlightSettingsModalProps {
  highlight: Highlight
  onClose: () => void
}

export const HighlightSettingsModal: React.FC<HighlightSettingsModalProps> = ({ highlight, onClose }) => {
  const { t } = useTranslation()
  const { updateHighlight } = useProjectStore()
  const { settings } = useSettingsStore()

  const defaultPreRoll = settings?.preRoll ?? 3
  const defaultPostRoll = settings?.postRoll ?? 3

  const [preRoll, setPreRoll] = useState<number>(highlight.preRollOverride ?? defaultPreRoll)
  const [postRoll, setPostRoll] = useState<number>(highlight.postRollOverride ?? defaultPostRoll)
  const [enableJumpCuts, setEnableJumpCuts] = useState<boolean>(!(highlight.disableJumpCuts ?? false))

  const handleSave = () => {
    updateHighlight(highlight.id, {
      preRollOverride: preRoll,
      postRollOverride: postRoll,
      disableJumpCuts: !enableJumpCuts
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-cs2-surface border border-cs2-border rounded-lg shadow-2xl w-full max-w-md p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            {t('tuning.title', 'Highlight Tuning')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Pre-roll */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                {t('tuning.preRoll', 'Pre-roll (seconds)')}
              </label>
              <span className="text-sm text-cs2-gold">{preRoll}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              step="1"
              value={preRoll}
              onChange={(e) => setPreRoll(Number(e.target.value))}
              className="w-full accent-cs2-gold"
            />
          </div>

          {/* Post-roll */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                {t('tuning.postRoll', 'Post-roll (seconds)')}
              </label>
              <span className="text-sm text-cs2-gold">{postRoll}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              step="1"
              value={postRoll}
              onChange={(e) => setPostRoll(Number(e.target.value))}
              className="w-full accent-cs2-gold"
            />
          </div>

          {/* Jump-cut Toggle */}
          <div className="flex items-center gap-3 bg-cs2-elevated p-3 rounded-md">
            <input
              type="checkbox"
              id="jump-cut"
              checked={enableJumpCuts}
              onChange={(e) => setEnableJumpCuts(e.target.checked)}
              className="w-4 h-4 text-cs2-gold bg-cs2-deep border-cs2-border rounded focus:ring-cs2-gold focus:ring-2"
            />
            <label htmlFor="jump-cut" className="text-sm text-gray-300 select-none cursor-pointer flex-1">
              {t('tuning.enableJumpCuts', 'Enable Smart Jump-Cuts')}
            </label>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cs2-elevated hover:bg-cs2-border text-gray-300 rounded transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-cs2-gold hover:bg-cs2-gold-dark text-cs2-deep font-medium rounded transition-colors"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
