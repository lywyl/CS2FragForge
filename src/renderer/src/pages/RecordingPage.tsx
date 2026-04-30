import React from 'react'
import { Construction } from 'lucide-react'
import { useTranslation } from '../i18n'

export const RecordingPage: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Construction className="w-16 h-16 text-cs2-text-muted mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">{t('recording.title')}</h2>
        <p className="text-cs2-text-muted mb-4">
          {t('recording.description')}
        </p>
        <p className="text-sm text-gray-500">
          {t('recording.subDescription')}
        </p>
      </div>
    </div>
  )
}
