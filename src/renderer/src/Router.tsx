import '@renderer/databases'

import type { FC } from 'react'
import { useMemo } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'

import Sidebar from './components/app/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import TabsContainer from './components/Tab/TabContainer'
import NavigationHandler from './handler/NavigationHandler'
import { useNavbarPosition } from './hooks/useSettings'
import CodeToolsPage from './pages/code/CodeToolsPage'
import FilesPage from './pages/files/FilesPage'
import HomePage from './pages/home/HomePage'
import KnowledgePage from './pages/knowledge/KnowledgePage'
import LaunchpadPage from './pages/launchpad/LaunchpadPage'
import MinAppPage from './pages/minapps/MinAppPage'
import MinAppsPage from './pages/minapps/MinAppsPage'
import NotesPage from './pages/notes/NotesPage'
import OpenClawPage from './pages/openclaw/OpenClawPage'
import PaintingsRoutePage from './pages/paintings/PaintingsRoutePage'
import SettingsPage from './pages/settings/SettingsPage'
import AssistantPresetsPage from './pages/store/assistants/presets/AssistantPresetsPage'
import TranslatePage from './pages/translate/TranslatePage'

/**
 * Always-mounted HomePage wrapper. Shows/hides via CSS so that navigating
 * to Settings (or other pages) does not unmount the chat, preserving
 * scroll position, streaming state, and all local component state.
 */
const HomePageKeepAlive: FC = () => {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div
      style={{
        display: isHome ? 'flex' : 'none',
        flex: 1,
        width: '100%',
        height: '100%'
      }}>
      <HomePage />
    </div>
  )
}

const Router: FC = () => {
  const { navbarPosition } = useNavbarPosition()

  // HomePage is kept alive separately — no Route for "/"
  const routes = useMemo(() => {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/store" element={<AssistantPresetsPage />} />
          <Route path="/paintings/*" element={<PaintingsRoutePage />} />
          <Route path="/translate" element={<TranslatePage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/apps/:appId" element={<MinAppPage />} />
          <Route path="/apps" element={<MinAppsPage />} />
          <Route path="/code" element={<CodeToolsPage />} />
          <Route path="/openclaw" element={<OpenClawPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/launchpad" element={<LaunchpadPage />} />
        </Routes>
      </ErrorBoundary>
    )
  }, [])

  if (navbarPosition === 'left') {
    return (
      <HashRouter>
        <Sidebar />
        <HomePageKeepAlive />
        {routes}
        <NavigationHandler />
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <NavigationHandler />
      <TabsContainer>
        <HomePageKeepAlive />
        {routes}
      </TabsContainer>
    </HashRouter>
  )
}

export default Router
