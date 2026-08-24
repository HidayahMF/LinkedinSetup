import { useCallback, useEffect, useState } from 'react'
import { versionsService } from '../services/profile'
import type { ProfileVersion } from '../types/profile'
import { DiffView } from '../components/DiffView'

export default function VersionsPage() {
  const [versions, setVersions] = useState<ProfileVersion[]>([])
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof versionsService.diff>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await versionsService.list()
      setVersions(data.versions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load versions')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function compare(a: string, b: string) {
    setError(null)
    setDiff(null)
    if (!a || !b || a === b) return
    try {
      const result = await versionsService.diff(a, b)
      setDiff(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diff failed')
    }
  }

  async function restore(id: string) {
    if (!window.confirm('Restore this version? The restored content becomes a NEW version — history is kept.')) return
    try {
      const result = await versionsService.restore(id)
      setNotice(`Restored from v${result.restoredFromVersion} as new v${result.newVersion.versionNumber}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed')
    }
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ versions</p>
        <h1 className="text-2xl font-bold tracking-tight">Versions</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Append-only history (flow.md §39). Rollback creates a new version; history is never
          destroyed.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ log ({versions.length} versions)</p>
        {versions.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">No versions yet — save the profile once.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--color-border)]">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-10 text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>v{v.versionNumber}</span>
                <span className="border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {v.source}
                </span>
                <span className="flex-1 truncate text-[var(--color-text-secondary)]">{v.label}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {new Date(v.createdAt).toLocaleString()}
                </span>
                <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                  from
                  <input
                    type="radio"
                    name="diff-from"
                    checked={fromId === v.id}
                    onChange={() => {
                      setFromId(v.id)
                      void compare(v.id, toId ?? '')
                    }}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                  to
                  <input
                    type="radio"
                    name="diff-to"
                    checked={toId === v.id}
                    onChange={() => {
                      setToId(v.id)
                      void compare(fromId ?? '', v.id)
                    }}
                  />
                </label>
                <button onClick={() => restore(v.id)} className="text-xs text-amber-600 hover:underline">
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {diff && (
        <section>
          <p className="mb-2 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ diff</p>
          <DiffView changes={diff.changes} />
        </section>
      )}
    </div>
  )
}
