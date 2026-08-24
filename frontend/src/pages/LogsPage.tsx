import { useEffect, useState } from 'react'
import { logsService } from '../services/workflow'
import type { AuditLogEntry } from '../types/posts'

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    logsService
      .list()
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>loading…</p>

  return (
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ logs</p>
        <h1 className="text-2xl font-bold tracking-tight">Execution Logs</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Append-only audit trail (flow.md §57). Failures are recorded honestly — never rewritten.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No audit entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                <th className="px-2 py-2 font-normal">when</th>
                <th className="px-2 py-2 font-normal">action</th>
                <th className="px-2 py-2 font-normal">entity</th>
                <th className="px-2 py-2 font-normal">after / detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {logs.map((log, i) => (
                <tr key={log.id ?? i} className="align-top">
                  <td className="whitespace-nowrap px-2 py-2 text-[11px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-[var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{log.actionType}</td>
                  <td className="px-2 py-2 text-[11px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {log.entityType}
                    <br />
                    <span className="text-[var(--color-text-muted)]">{String(log.entityId).slice(0, 12)}…</span>
                  </td>
                  <td className="max-w-md px-2 py-2">
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-1.5 text-[10px] text-[var(--color-text-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                      {JSON.stringify(log.after ?? log.before ?? null).slice(0, 400)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
