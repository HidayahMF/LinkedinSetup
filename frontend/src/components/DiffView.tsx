import type { FieldDiff } from '../types/profile'

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/** BEFORE/AFTER diff view (flow.md §40). */
export function DiffView({ changes }: { changes: FieldDiff[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-slate-500">No differences.</p>
  }
  return (
    <div className="space-y-3">
      {changes.map((change, index) => (
        <div key={`${change.field}-${index}`} className="rounded border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-slate-400">
            {change.field}
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            <pre className="whitespace-pre-wrap px-3 py-2 text-sm text-rose-200 line-through decoration-rose-500/60">
              {stringify(change.before)}
            </pre>
            <pre className="whitespace-pre-wrap border-t border-slate-800 px-3 py-2 text-sm text-emerald-200 md:border-l md:border-t-0">
              {stringify(change.after)}
            </pre>
          </div>
        </div>
      ))}
    </div>
  )
}
