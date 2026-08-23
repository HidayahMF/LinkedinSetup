import { useState } from 'react'
import { getCurrentUserId, setCurrentUserId } from '../services/api'

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
  'w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none'

export default function SettingsPage() {
  const [userId, setUserId] = useState(getCurrentUserId())
  const [prefs, setPrefs] = useState<StylePrefs>(loadPrefs())
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setCurrentUserId(userId.trim())
    savePrefs(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-slate-500">
          Workspace identity and content style preferences (flow.md §14).
        </p>
      </header>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold">Workspace user id</h3>
        <input
          aria-label="user id"
          className={`${inputClass} font-mono`}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          Sent as x-user-id on every API call. All data is strictly scoped to this identity.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="col-span-2 font-semibold">Content style</h3>
        <label className="text-sm text-slate-400">
          Language
          <input
            aria-label="language"
            className={inputClass}
            value={prefs.language}
            onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}
          />
        </label>
        <label className="text-sm text-slate-400">
          Tone
          <input
            aria-label="tone"
            className={inputClass}
            value={prefs.tone}
            onChange={(e) => setPrefs({ ...prefs, tone: e.target.value })}
          />
        </label>
        <label className="text-sm text-slate-400">
          Length
          <input
            aria-label="length"
            className={inputClass}
            value={prefs.length}
            onChange={(e) => setPrefs({ ...prefs, length: e.target.value })}
          />
        </label>
        <label className="text-sm text-slate-400">
          Target role
          <input
            aria-label="target role"
            placeholder="e.g. Software Engineer"
            className={inputClass}
            value={prefs.targetRole}
            onChange={(e) => setPrefs({ ...prefs, targetRole: e.target.value })}
          />
        </label>
      </section>

      <button
        onClick={handleSave}
        className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
      >
        Save settings
      </button>
      {saved && <p className="text-sm text-emerald-400">Saved.</p>}
    </div>
  )
}
