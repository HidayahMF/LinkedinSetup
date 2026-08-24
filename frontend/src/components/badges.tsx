import type { RiskLevel } from '../types/workflow'

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'border border-[var(--color-border)] text-[var(--color-text-secondary)]',
  medium: 'border border-blue-200 bg-blue-50 text-blue-700',
  high: 'border border-orange-200 bg-orange-50 text-orange-700',
  critical: 'border border-red-200 bg-red-50 text-red-700',
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${RISK_COLORS[level]}`}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {level}
    </span>
  )
}

const STATE_COLORS: Record<string, string> = {
  approved: 'border border-green-200 bg-green-50 text-green-700',
  completed: 'border border-green-200 bg-green-50 text-green-700',
  published: 'border border-green-200 bg-green-50 text-green-700',
  waiting_for_approval: 'border border-amber-200 bg-amber-50 text-amber-700',
  final_draft: 'border border-green-200 bg-green-50 text-green-700',
  publish_confirmed: 'border border-amber-200 bg-amber-50 text-amber-700',
  proposed: 'border border-[var(--color-border)] text-[var(--color-text-secondary)]',
  draft: 'border border-[var(--color-border)] text-[var(--color-text-secondary)]',
  failed: 'border border-red-200 bg-red-50 text-red-700',
  rejected: 'border border-red-200 bg-red-50 text-red-700',
  blocked_fact_check: 'border border-red-200 bg-red-50 text-red-700',
  cancelled: 'border border-[var(--color-border)] text-[var(--color-text-muted)]',
  skipped: 'border border-[var(--color-border)] text-[var(--color-text-muted)]',
  unverified: 'border border-yellow-200 bg-yellow-50 text-yellow-700',
  executing: 'border border-blue-200 bg-blue-50 text-blue-700',
  verifying: 'border border-blue-200 bg-blue-50 text-blue-700',
  ready_to_execute: 'border border-green-200 bg-green-50 text-green-700',
}

export function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${STATE_COLORS[state] ?? 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {state}
    </span>
  )
}
