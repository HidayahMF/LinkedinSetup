import type { RiskLevel } from '../types/workflow'

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'bg-slate-800 text-slate-300',
  medium: 'bg-sky-900 text-sky-200',
  high: 'bg-orange-900 text-orange-200',
  critical: 'bg-rose-900 text-rose-200',
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`rounded px-2 py-0.5 font-mono text-xs uppercase ${RISK_COLORS[level]}`}>
      {level}
    </span>
  )
}

const STATE_COLORS: Record<string, string> = {
  approved: 'bg-emerald-900 text-emerald-200',
  completed: 'bg-emerald-700 text-emerald-100',
  published: 'bg-emerald-700 text-emerald-100',
  waiting_for_approval: 'bg-amber-900 text-amber-200',
  final_draft: 'bg-emerald-900 text-emerald-200',
  publish_confirmed: 'bg-amber-800 text-amber-100',
  proposed: 'bg-slate-800 text-slate-300',
  draft: 'bg-slate-800 text-slate-300',
  failed: 'bg-rose-900 text-rose-200',
  rejected: 'bg-rose-950 text-rose-300',
  blocked_fact_check: 'bg-rose-900 text-rose-200',
  cancelled: 'bg-slate-900 text-slate-500',
  skipped: 'bg-slate-900 text-slate-500',
  unverified: 'bg-yellow-800 text-yellow-100',
  executing: 'bg-sky-800 text-sky-100',
  verifying: 'bg-sky-800 text-sky-100',
  ready_to_execute: 'bg-emerald-800 text-emerald-100',
}

export function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-xs ${STATE_COLORS[state] ?? 'bg-slate-800 text-slate-300'}`}
    >
      {state}
    </span>
  )
}
