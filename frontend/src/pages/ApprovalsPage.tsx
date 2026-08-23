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
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold">Approvals</h2>
        <p className="text-sm text-slate-500">
          Approve all, single actions, or exclude specific ones (flow.md §44/§47). Approval binds to
          the exact content hash and expires.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      {pending.length === 0 && <p className="text-slate-500">Nothing waiting for approval.</p>}

      <div className="space-y-4">
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
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold">History</h3>
          <ul className="space-y-1 text-sm text-slate-400">
            {decided.slice(0, 15).map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono uppercase">{p.state}</span>
                <span>{p.title}</span>
                <span className="ml-auto font-mono text-slate-600">{p.contentHash.slice(0, 12)}…</span>
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
    <article className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{proposal.title}</h3>
        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
          v{proposal.proposalVersion}
        </span>
        <RiskBadge level={proposal.plannedActions[0]?.riskLevel ?? 'low'} />
        {!ready && (
          <span className="rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
            NOT READY — unresolved claims block approval
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-slate-600">
          expires {new Date(proposal.expiresAt).toLocaleString()}
        </span>
      </div>

      <DiffView changes={proposal.changes.map((c) => ({ field: c.field, before: c.before, after: c.after }))} />

      {fv && !fv.isReady && (
        <ul className="mt-2 space-y-1 rounded border border-amber-900 bg-amber-950/40 p-2 text-xs text-amber-200">
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
            <span className="font-mono text-xs text-sky-300">{action.actionType}</span>
            <span className="text-slate-400">{action.summary}</span>
          </li>
        ))}
      </ul>

      {proposal.changes.length > 0 && (
        <div className="mt-2">
          {editingField !== null ? (
            <div className="space-y-1">
              <textarea
                rows={4}
                aria-label="edit after content"
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onEdit(editingField, editValue)
                    setEditingField(null)
                  }}
                  className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600"
                >
                  Save as new version
                </button>
                <button onClick={() => setEditingField(null)} className="text-sm text-slate-400 hover:underline">
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
                className="mt-2 text-xs text-sky-400 hover:underline"
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
          className="rounded bg-emerald-700 px-4 py-1 text-sm font-medium hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve selected
        </button>
        <button onClick={onReject} className="rounded bg-rose-800 px-4 py-1 text-sm hover:bg-rose-700">
          Reject
        </button>
      </div>
    </article>
  )
}
