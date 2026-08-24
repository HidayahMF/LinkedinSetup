import { useEffect, useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import AgentPage from './pages/AgentPage'
import ProfilePage from './pages/ProfilePage'
import PostsPage from './pages/PostsPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import { me as fetchMe, logout } from './services/auth'
import type { SessionUser } from './services/api'

export default function App() {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchMe().then((u) => {
      if (!cancelled) {
        setUser(u)
        setChecking(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSignOut() {
    await logout()
    setUser(null)
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <p className="text-sm text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>checking session…</p>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />
  }

  return (
    <Layout active={tab} onNavigate={setTab} user={user} onSignOut={handleSignOut}>
      {tab === 'dashboard' && <DashboardPage onNavigate={(key) => setTab(key as TabKey)} />}
      {tab === 'ai-assistant' && <AgentPage />}
      {tab === 'profile' && <ProfilePage />}
      {tab === 'posts' && <PostsPage />}
      {tab === 'activity' && <div className="p-8 text-[var(--color-text)]">
        <h2 className="text-xl font-bold mb-4">Activity</h2>
        <p className="text-[var(--color-text-secondary)] mb-4">
          Review, approvals, and queue features are now accessible through their respective sections:
        </p>
        <ul className="list-disc pl-5 text-[var(--color-text-secondary)]">
          <li>My Profile → Versions</li>
          <li>AI Assistant → Review / Approvals</li>
          <li>Posts → Execution history</li>
        </ul>
      </div>}
      {tab === 'settings' && <SettingsPage user={user} onSignOut={handleSignOut} />}
    </Layout>
  )
}