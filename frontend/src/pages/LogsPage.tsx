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

  if (loading) return <p className="text-slate-400">Loading…</p>

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">Execution Logs</h2>
        <p className="text-sm text-slate-500">
          Append-only audit trail (flow.md §57). Failures are recorded honestly — never rewritten.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {logs.length === 0 ? (
        <p className="text-slate-500">No audit entries yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1.5">When</th>
              <th className="px-2 py-1.5">Action</th>
              <th className="px-2 py-1.5">Entity</th>
              <th className="px-2 py-1.5">After / detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {logs.map((log, i) => (
              <tr key={log.id ?? i} className="align-top">
                <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-400">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-2 py-2 font-mono text-xs text-sky-300">{log.actionType}</td>
                <td className="px-2 py-2 font-mono text-xs text-slate-400">
                  {log.entityType}
                  <br />
                  <span className="text-slate-600">{String(log.entityId).slice(0, 12)}…</span>
                </td>
                <td className="max-w-md px-2 py-2">
                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900/80 p-1.5 text-[11px] text-slate-300">
                    {JSON.stringify(log.after ?? log.before ?? null).slice(0, 400)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
