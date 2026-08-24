import { useCallback, useEffect, useState } from 'react'
import { proposalsService } from '../services/workflow'
import type { Proposal } from '../types/workflow'
import { RiskBadge } from '../components/badges'
import { DiffView } from '../components/DiffView'

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await proposalsService.list()
      setProposals(data.proposals)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load proposals')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function approveWithScope(proposal: Proposal, approvedActionIds: string[]) {
    setError(null)
    setNotice(null)
    try {
      const rejected = proposal.plannedActions
        .map((a) => a.actionId)
        .filter((id) => !approvedActionIds.includes(id))
      const result = await proposalsService.approve(proposal.id, {
        approvedActionIds,
        rejectedActionIds: rejected,
      })
      setNotice(
        `Approved ${result.queue.approved} action(s), excluded ${result.queue.rejected}. Execute them from the Action Queue.`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed')
    }
  }

  async function reject(proposal: Proposal) {
    setError(null)
    try {
      await proposalsService.reject(proposal.id)
      setNotice('Proposal rejected.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed')
    }
  }

  const pending = proposals.filter((p) =>
    ['waiting_for_approval', 'proposed'].includes(p.state),
  )
  const decided = proposals.filter(
    (p) => !['waiting_for_approval', 'proposed'].includes(p.state),
  )

  return (
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ approvals</p>
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Approve all, single actions, or exclude specific ones (flow.md §44/§47). Approval binds to
          the exact content hash and expires.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      {pending.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">Nothing waiting for approval.</p>}

      <div className="space-y-6">
        {pending.map((proposal) => (
          <PendingProposalCard
            key={proposal.id}
            proposal={proposal}
            onApprove={(ids) => approveWithScope(proposal, ids)}
            onReject={() => reject(proposal)}
            onEdit={async (field, after) => {
              setError(null)
              try {
                await proposalsService.edit(proposal.id, [{ field, after }])
                setNotice('Edit saved as a NEW proposal version; old approval invalidated.')
                await load()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Edit failed')
              }
            }}
          />
        ))}
      </div>

      {decided.length > 0 && (
        <section>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ history</p>
          <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]">
            {decided.slice(0, 15).map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className="uppercase text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{p.state}</span>
                <span>{p.title}</span>
                <span className="ml-auto text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{p.contentHash.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PendingProposalCard({
  proposal,
  onApprove,
  onReject,
  onEdit,
}: {
  proposal: Proposal
  onApprove: (approvedActionIds: string[]) => void
  onReject: () => void
  onEdit: (field: string, after: string) => void
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposal.plannedActions.map((a) => [a.actionId, true])),
  )
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const fv = proposal.factValidation
  const ready = fv?.isReady ?? false

  return (
    <article className="border border-[var(--color-border)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-[var(--color-text)]">{proposal.title}</h3>
        <span className="border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          v{proposal.proposalVersion}
        </span>
        <RiskBadge level={proposal.plannedActions[0]?.riskLevel ?? 'low'} />
        {!ready && (
          <span className="border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
            NOT READY — unresolved claims block approval
          </span>
        )}
        <span className="ml-auto text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          expires {new Date(proposal.expiresAt).toLocaleString()}
        </span>
      </div>

      <DiffView changes={proposal.changes.map((c) => ({ field: c.field, before: c.before, after: c.after }))} />

      {fv && !fv.isReady && (
        <ul className="mt-3 space-y-1 border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          {fv.claims
            ?.filter((c) => c.status !== 'supported')
            .map((c, i) => (
              <li key={i}>
                ⚠ [{c.status}] {c.claim} — {c.reason}
              </li>
            ))}
        </ul>
      )}

      <ul className="mt-3 space-y-1">
        {proposal.plannedActions.map((action) => (
          <li key={action.actionId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={`approve ${action.summary}`}
              checked={selected[action.actionId] ?? false}
              onChange={(e) => setSelected({ ...selected, [action.actionId]: e.target.checked })}
            />
            <RiskBadge level={action.riskLevel} />
            <span className="text-[10px] text-[var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{action.actionType}</span>
            <span className="text-[var(--color-text-secondary)]">{action.summary}</span>
          </li>
        ))}
      </ul>

      {proposal.changes.length > 0 && (
        <div className="mt-3">
          {editingField !== null ? (
            <div className="space-y-1">
              <textarea
                rows={4}
                aria-label="edit after content"
                className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onEdit(editingField, editValue)
                    setEditingField(null)
                  }}
                  className="border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                >
                  Save as new version
                </button>
                <button onClick={() => setEditingField(null)} className="text-sm text-[var(--color-text-muted)] hover:underline">
                  cancel
                </button>
              </div>
            </div>
          ) : (
            proposal.changes[0]?.after != null && (
              <button
                onClick={() => {
                  setEditingField(String(proposal.changes[0].field))
                  setEditValue(String(proposal.changes[0].after))
                }}
                className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
              >
                edit BEFORE approving → creates a new version
              </button>
            )
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          disabled={!ready}
          onClick={() => onApprove(Object.keys(selected).filter((k) => selected[k]))}
          className="border border-green-600 bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve selected
        </button>
        <button onClick={onReject} className="border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:border-red-300 hover:text-red-600">
          Reject
        </button>
      </div>
    </article>
  )
}
