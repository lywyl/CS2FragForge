import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TitleBar } from './components/TitleBar'
import { SidebarNav } from './components/SidebarNav'
import { WelcomePage } from './pages/WelcomePage'
import { ProjectPage } from './pages/ProjectPage'
import { RecordingPage } from './pages/RecordingPage'
import { EditorPage } from './pages/EditorPage'
import { SettingsPage } from './pages/SettingsPage'
import { ExportPage } from './pages/ExportPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/ToastContainer'
import { useProjectStore } from './stores/useProjectStore'

function AppRoutes(): React.JSX.Element {
  const { project } = useProjectStore()

  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route
        path="/project"
        element={project ? <ProjectPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/recording"
        element={project ? <RecordingPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/editor"
        element={project ? <EditorPage /> : <Navigate to="/" replace />}
      />
      <Route path="/settings" element={<SettingsPage />} />
      <Route
        path="/export"
        element={project ? <ExportPage /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppContent(): React.JSX.Element {
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav />
        <main className="flex-1 overflow-auto">
          <AppRoutes />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App