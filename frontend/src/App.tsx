import { useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import AgentPage from './pages/AgentPage'
import ProfileFactsPage from './pages/ProfileFactsPage'
import ProfilePage from './pages/ProfilePage'
import PostsPage from './pages/PostsPage'
import ReviewPage from './pages/ReviewPage'
import VersionsPage from './pages/VersionsPage'
import ApprovalsPage from './pages/ApprovalsPage'
import QueuePage from './pages/QueuePage'
import LogsPage from './pages/LogsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const [tab, setTab] = useState<TabKey>('facts')

  return (
    <Layout active={tab} onNavigate={setTab}>
      {tab === 'dashboard' && <DashboardPage onNavigate={(key) => setTab(key as TabKey)} />}
      {tab === 'agent' && <AgentPage />}
      {tab === 'facts' && <ProfileFactsPage />}
      {tab === 'profile' && <ProfilePage />}
      {tab === 'posts' && <PostsPage />}
      {tab === 'review' && <ReviewPage />}
      {tab === 'versions' && <VersionsPage />}
      {tab === 'approvals' && <ApprovalsPage />}
      {tab === 'queue' && <QueuePage />}
      {tab === 'logs' && <LogsPage />}
      {tab === 'settings' && <SettingsPage />}
    </Layout>
  )
}
