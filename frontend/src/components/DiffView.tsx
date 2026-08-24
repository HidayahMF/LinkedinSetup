import type { FieldDiff } from '../types/profile'

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/** BEFORE/AFTER diff view (flow.md §40). */
export function DiffView({ changes }: { changes: FieldDiff[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No differences.</p>
  }
  return (
    <div className="space-y-4">
      {changes.map((change, index) => (
        <div key={`${change.field}-${index}`} className="border border-[var(--color-border)]">
          <div
            className="border-b border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-1.5 text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {change.field}
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            <pre className="whitespace-pre-wrap px-3 py-2 text-sm text-red-600 line-through decoration-red-300/60">
              {stringify(change.before)}
            </pre>
            <pre className="whitespace-pre-wrap border-t border-[var(--color-border)] px-3 py-2 text-sm text-green-700 md:border-l md:border-t-0">
              {stringify(change.after)}
            </pre>
          </div>
        </div>
      ))}
    </div>
  )
}
