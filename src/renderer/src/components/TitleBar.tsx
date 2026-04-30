import React from 'react'
import { useTranslation } from '../i18n'

export const TitleBar: React.FC = () => {
  const { t } = useTranslation()
  const handleMinimize = () => window.electronAPI?.windowMinimize()
  const handleMaximize = () => window.electronAPI?.windowMaximize()
  const handleClose = () => window.electronAPI?.windowClose()

  return (
    <div
      className="h-8 bg-cs2-deep flex items-center justify-between px-4 select-none border-b border-cs2-gold/20"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="text-white text-sm font-medium">{t('app.title')}</span>
      <div
        className="flex gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-6 h-6 flex items-center justify-center text-cs2-text-muted hover:text-white hover:bg-cs2-elevated rounded"
        >
          ─
        </button>
        <button
          onClick={handleMaximize}
          className="w-6 h-6 flex items-center justify-center text-cs2-text-muted hover:text-white hover:bg-cs2-elevated rounded"
        >
          □
        </button>
        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center text-cs2-text-muted hover:text-white hover:bg-red-600 rounded"
        >
          ×
        </button>
      </div>
    </div>
  )
}
