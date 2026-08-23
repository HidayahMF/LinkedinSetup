import type { FactStatus, FactType } from '../types/profileFact'

const STATUS_COLORS: Record<FactStatus, string> = {
  verified: 'bg-emerald-900 text-emerald-200',
  needs_confirmation: 'bg-amber-900 text-amber-200',
  unknown: 'bg-slate-800 text-slate-300',
  do_not_use: 'bg-rose-900 text-rose-200',
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
    <span className={`rounded px-2 py-0.5 font-mono text-xs ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  )
}

export function TypeBadge({ type }: { type: FactType }) {
  return (
    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300">
      {TYPE_LABELS[type]}
      {type === 'generated_positioning' && (
        <span title="Cannot become a verified fact without explicit user confirmation">
          {' '}
          ⚠
        </span>
      )}
    </span>
  )
}
