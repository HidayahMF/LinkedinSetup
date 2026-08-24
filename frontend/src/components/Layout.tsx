import { useState, type ReactNode } from 'react'

export type TabKey =
  | 'dashboard'
  | 'ai-assistant'
  | 'profile'
  | 'posts'
  | 'activity'
  | 'settings'

const NAV: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ai-assistant', label: 'AI Assistant' },
  { key: 'profile', label: 'My Profile' },
  { key: 'posts', label: 'Posts' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
]

export function Layout({
  active,
  onNavigate,
  user,
  onSignOut,
  children,
}: {
  active: TabKey
  onNavigate: (key: TabKey) => void
  user: { email: string }
  onSignOut: () => void
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  function navigate(key: TabKey) {
    onNavigate(key)
    setMobileOpen(false)
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          {/* Logo / title */}
          <button
            onClick={() => navigate('dashboard')}
            className="font-[var(--font-mono)] text-sm font-semibold tracking-tight text-[var(--color-text)] hover:text-[var(--color-accent)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            ~/linkedin-agent
          </button>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="main navigation">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`px-2 py-1 text-xs transition ${
                  active === item.key
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Account indicator */}
          <div className="hidden items-center gap-2 md:flex">
            <span
              className="text-xs text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
              title={`signed in as ${user.email}`}
            >
              {user.email}
            </span>
            <button
              onClick={onSignOut}
              className="border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex flex-col gap-1 p-1 md:hidden"
            aria-label="Toggle menu"
          >
            <span className={`block h-0.5 w-5 bg-[var(--color-text)] transition-transform ${mobileOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 bg-[var(--color-text)] transition-opacity ${mobileOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-[var(--color-text)] transition-transform ${mobileOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
          </button>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <nav className="border-t border-[var(--color-border)] px-6 py-3 md:hidden" aria-label="mobile navigation">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {user.email}
              </span>
              <button
                onClick={onSignOut}
                className="border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                sign out
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  className={`px-2 py-1.5 text-left text-sm transition ${
                    active === item.key
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {active === item.key ? '→ ' : '  '}{item.label}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        {children}
      </main>
    </div>
  )
}
