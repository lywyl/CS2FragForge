import React, { Component, ErrorInfo, ReactNode } from 'react'
import { I18nContext } from '../i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static contextType = I18nContext
  declare context: React.ContextType<typeof I18nContext>

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    const t = this.context?.t ?? ((key: string) => key)

    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-cs2-deep text-white">
          <div className="text-center max-w-md p-8">
            <div className="text-6xl mb-4">💥</div>
            <h1 className="text-2xl font-bold mb-2">{t('error.title')}</h1>
            <p className="text-cs2-text-muted mb-4 text-sm">
              {this.state.error?.message || t('error.message')}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-cs2-gold hover:bg-cs2-gold-dark rounded-lg text-cs2-deep font-medium transition-colors"
              >
                {t('error.tryAgain')}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-cs2-elevated hover:bg-cs2-border rounded-lg text-gray-300 transition-colors"
              >
                {t('error.reloadApp')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
