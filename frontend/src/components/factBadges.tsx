import type { FactStatus, FactType } from '../types/profileFact'

const STATUS_COLORS: Record<FactStatus, string> = {
  verified: 'border border-green-200 bg-green-50 text-green-700',
  needs_confirmation: 'border border-amber-200 bg-amber-50 text-amber-700',
  unknown: 'border border-[var(--color-border)] text-[var(--color-text-secondary)]',
  do_not_use: 'border border-red-200 bg-red-50 text-red-700',
}

const TYPE_LABELS: Record<FactType, string> = {
  fact: 'FACT',
  inference: 'INFERENCE',
  generated_content: 'GENERATED',
  generated_positioning: 'POSITIONING*',
  user_authored_content: 'USER-AUTHORED',
}

export function StatusBadge({ status }: { status: FactStatus }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_COLORS[status]}`}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {status}
    </span>
  )
}

export function TypeBadge({ type }: { type: FactType }) {
  return (
    <span
      className="inline-block border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-accent)]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {TYPE_LABELS[type]}
      {type === 'generated_positioning' && (
        <span title="Cannot become a verified fact without explicit user confirmation">
          {' '}⚠
        </span>
      )}
    </span>
  )
}
