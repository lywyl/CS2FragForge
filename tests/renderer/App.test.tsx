import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nContext } from '../../src/renderer/src/i18n'
import App from '../../src/renderer/src/App'
import { en } from '../../src/renderer/src/i18n/en'

// Provide English locale for tests to match expected strings
const englishContext = {
  locale: 'en' as const,
  setLocale: () => {},
  t: (key: keyof typeof en) => en[key] ?? key
}

function renderWithEnglish(ui: React.ReactElement) {
  return render(
    <I18nContext.Provider value={englishContext}>
      {ui}
    </I18nContext.Provider>
  )
}

describe('App', () => {
  it('renders the application shell with title', () => {
    renderWithEnglish(<App />)
    const titles = screen.getAllByText('CS2 Demo Cutter')
    expect(titles.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the home navigation item', () => {
    renderWithEnglish(<App />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders the welcome page drop zone with .dem reference', () => {
    renderWithEnglish(<App />)
    const demElements = screen.getAllByText(/\.dem/i)
    expect(demElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the settings navigation item', () => {
    renderWithEnglish(<App />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
