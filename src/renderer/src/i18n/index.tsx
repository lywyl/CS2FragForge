import React, { createContext, useContext, useState, useCallback } from 'react'
import { en, type TranslationKey } from './en'
export type { TranslationKey } from './en'
import { zh } from './zh'

export type Locale = 'en' | 'zh'

const locales: Record<Locale, Record<TranslationKey, string>> = { en, zh }

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nContextValue>(null!)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('locale')
    return saved === 'zh' || saved === 'en' ? saved : 'zh'
  })

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text = locales[locale][key] ?? key
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v))
        })
      }
      return text
    },
    [locale]
  )

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }, [])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  return useContext(I18nContext)
}
