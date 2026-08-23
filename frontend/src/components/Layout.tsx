import type { ReactNode } from 'react'

export type TabKey =
  | 'dashboard'
  | 'agent'
  | 'facts'
  | 'profile'
  | 'posts'
  | 'review'
  | 'versions'
  | 'approvals'
  | 'queue'
  | 'logs'
  | 'settings'

const NAV: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: 'dashboard', label: 'Dashboard', hint: 'Agent status & observability' },
  { key: 'agent', label: 'AI Agent', hint: 'Command pipeline' },
  { key: 'facts', label: 'Source of Truth', hint: 'Verified profile facts' },
  { key: 'profile', label: 'Profile', hint: 'Sections editor' },
  { key: 'posts', label: 'Posts', hint: 'Draft → review → publish' },
  { key: 'review', label: 'AI Review', hint: 'Strengths / issues / scores' },
  { key: 'versions', label: 'Versions', hint: 'History, diff, rollback' },
  { key: 'approvals', label: 'Approvals', hint: 'Pending decisions' },
  { key: 'queue', label: 'Action Queue', hint: 'Approved execution' },
  { key: 'logs', label: 'Execution Logs', hint: 'Append-only audit trail' },
  { key: 'settings', label: 'Settings', hint: 'Identity & preferences' },
]

export function Layout({
  active,
  onNavigate,
  children,
}: {
  active: TabKey
  onNavigate: (key: TabKey) => void
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900/60 p-4">
        <h1 className="mb-1 text-lg font-bold tracking-tight">LinkedIn AI Agent</h1>
        <p className="mb-6 text-xs text-slate-500">User approves. AI suggests. Executor obeys.</p>
        <nav className="space-y-1" aria-label="main navigation">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`block w-full rounded px-3 py-2 text-left text-sm transition ${
                active === item.key
                  ? 'bg-sky-600/20 font-medium text-sky-300'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
              title={item.hint}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
