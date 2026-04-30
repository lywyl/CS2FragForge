import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FolderOpen, Film, Settings, Download, Video } from 'lucide-react'
import { useProjectStore } from '../stores/useProjectStore'
import { useTranslation, type TranslationKey } from '../i18n'

interface NavItem {
  labelKey: TranslationKey
  icon: React.ReactNode
  path: string
  requiresProject: boolean
}

export const SidebarNav: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { project } = useProjectStore()
  const { t } = useTranslation()

  const navItems: NavItem[] = [
    { labelKey: 'nav.home', icon: <FolderOpen className="w-4 h-4" />, path: '/', requiresProject: false },
    { labelKey: 'nav.project', icon: <Video className="w-4 h-4" />, path: '/project', requiresProject: true },
    { labelKey: 'nav.recording', icon: <Film className="w-4 h-4" />, path: '/recording', requiresProject: true },
    { labelKey: 'nav.editor', icon: <Film className="w-4 h-4" />, path: '/editor', requiresProject: true },
    { labelKey: 'nav.export', icon: <Download className="w-4 h-4" />, path: '/export', requiresProject: true },
    { labelKey: 'nav.settings', icon: <Settings className="w-4 h-4" />, path: '/settings', requiresProject: false }
  ]

  return (
    <nav className="w-52 bg-cs2-surface border-r border-cs2-border/50 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-cs2-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-cs2-gold rounded-lg flex items-center justify-center">
            <Film className="w-4 h-4 text-cs2-deep" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">{t('nav.logo')}</span>
        </div>
      </div>

      {/* Nav Items */}
      <ul className="flex-1 py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          const isDisabled = item.requiresProject && !project

          return (
            <li key={item.path}>
              <button
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-cs2-gold/10 text-cs2-gold font-medium'
                    : isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-cs2-text-muted hover:bg-cs2-elevated/50 hover:text-white'
                }`}
                onClick={() => {
                  if (!isDisabled) {
                    navigate(item.path)
                  }
                }}
                disabled={isDisabled}
              >
                <span className={isActive ? 'text-cs2-gold' : isDisabled ? 'text-gray-600' : 'text-gray-500'}>
                  {item.icon}
                </span>
                <span>{t(item.labelKey)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Project Status */}
      {project && (
        <div className="px-3 py-3 border-t border-cs2-border/50">
          <div className="text-xs text-cs2-text-muted mb-1">{t('nav.currentProject')}</div>
          <div className="text-sm text-gray-300 truncate">{project.demoName}</div>
          <div className="flex items-center gap-1 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              project.status === 'parsed' ? 'bg-green-500' :
              project.status === 'recording' ? 'bg-cs2-gold' :
              project.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
            }`} />
            <span className="text-xs text-cs2-text-muted capitalize">{project.status}</span>
          </div>
        </div>
      )}
    </nav>
  )
}
