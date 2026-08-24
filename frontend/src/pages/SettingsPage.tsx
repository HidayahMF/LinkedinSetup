import { useState } from 'react'
import type { SessionUser } from '../services/api'

const PREFS_KEY = 'linkedin-agent-prefs'

export interface StylePrefs {
  language: string
  tone: string
  length: string
  targetRole: string
}

const DEFAULT_PREFS: StylePrefs = {
  language: 'English',
  tone: 'professional but natural',
  length: 'medium',
  targetRole: '',
}

export function loadPrefs(): StylePrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: StylePrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

const inputClass =
  'w-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

export default function SettingsPage({
  user,
  onSignOut,
}: {
  user: SessionUser
  onSignOut: () => void
}) {
  const [prefs, setPrefs] = useState<StylePrefs>(loadPrefs())
  const [saved, setSaved] = useState(false)

  function handleSave() {
    savePrefs(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ settings</p>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Workspace identity and content style preferences (flow.md §14).
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      <section className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ account</p>
        <div className="mt-2 space-y-1 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <p className="text-sm text-[var(--color-text)]">{user.email}</p>
          <p className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            id: {user.id}
          </p>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Identity comes from a verified server-side session. All data is strictly scoped to this account.
        </p>
        <button
          onClick={onSignOut}
          className="border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] transition hover:border-red-500/60 hover:text-red-500"
        >
          Sign out
        </button>
      </section>

      <hr className="border-[var(--color-border)]" />

      <section className="space-y-4">
        <p className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ content-style</p>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm text-[var(--color-text-secondary)]">
            Language
            <input
              aria-label="language"
              className={`${inputClass} mt-1`}
              value={prefs.language}
              onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}
            />
          </label>
          <label className="text-sm text-[var(--color-text-secondary)]">
            Tone
            <input
              aria-label="tone"
              className={`${inputClass} mt-1`}
              value={prefs.tone}
              onChange={(e) => setPrefs({ ...prefs, tone: e.target.value })}
            />
          </label>
          <label className="text-sm text-[var(--color-text-secondary)]">
            Length
            <input
              aria-label="length"
              className={`${inputClass} mt-1`}
              value={prefs.length}
              onChange={(e) => setPrefs({ ...prefs, length: e.target.value })}
            />
          </label>
          <label className="text-sm text-[var(--color-text-secondary)]">
            Target role
            <input
              aria-label="target role"
              placeholder="e.g. Software Engineer"
              className={`${inputClass} mt-1`}
              value={prefs.targetRole}
              onChange={(e) => setPrefs({ ...prefs, targetRole: e.target.value })}
            />
          </label>
        </div>
      </section>

      <button
        onClick={handleSave}
        className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
      >
        Save settings
      </button>
      {saved && <p className="text-sm text-green-600">Saved.</p>}
    </div>
  )
}
