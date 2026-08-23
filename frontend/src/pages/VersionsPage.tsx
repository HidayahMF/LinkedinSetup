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
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold">Versions</h2>
        <p className="text-sm text-slate-500">
          Append-only history (flow.md §39). Rollback creates a new version; history is never
          destroyed.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        {versions.length === 0 ? (
          <p className="text-sm text-slate-500">No versions yet — save the profile once.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-10 font-mono text-slate-500">v{v.versionNumber}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300">{v.source}</span>
                <span className="flex-1 truncate text-slate-300">{v.label}</span>
                <span className="font-mono text-xs text-slate-600">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
                <label className="flex items-center gap-1 text-xs text-slate-400">
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
                <label className="flex items-center gap-1 text-xs text-slate-400">
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
                <button onClick={() => restore(v.id)} className="text-xs text-amber-300 hover:underline">
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {diff && (
        <section>
          <h3 className="mb-2 font-semibold">Diff</h3>
          <DiffView changes={diff.changes} />
        </section>
      )}
    </div>
  )
}
