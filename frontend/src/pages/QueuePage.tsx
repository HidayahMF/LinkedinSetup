import { useCallback, useEffect, useState } from 'react'
import { actionsService } from '../services/workflow'
import type { LinkedInAction, ContractCheck } from '../types/workflow'
import { RiskBadge } from '../components/badges'

export default function QueuePage() {
  const [actions, setActions] = useState<LinkedInAction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<{ actionId: string; checks: ContractCheck[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await actionsService.list()
      setActions(data.actions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(fn: () => Promise<unknown>, successText: string) {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await fn()
      setNotice(successText)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function execute(id: string) {
    setBusy(true)
    setError(null)
    setChecklist(null)
    try {
      const result = await actionsService.execute(id)
      setChecklist({ actionId: id, checks: result.checklist })
      if (!result.checklist.every((c) => c.passed)) {
        setError('Execution blocked by the Final Execution Contract — see checklist below.')
      } else {
        setNotice(
          `Action ${result.status}${result.reason ? ` — ${result.reason}` : ''}. ${
            result.status === 'unverified' ? 'Could NOT verify the change on the target site.' : ''
          }`,
        )
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ queue</p>
          <h1 className="text-2xl font-bold tracking-tight">Action Queue</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Executor only takes APPROVED items. Every run passes a 21-check contract and is audited.
          </p>
        </div>
        <button
          onClick={() =>
            run(() => actionsService.runQueue(), 'Queue run finished. Unverified results halt the queue for review.')
          }
          disabled={busy}
          className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Run approved queue
        </button>
      </header>

      <hr className="border-[var(--color-border)]" />

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">{notice}</p>
      )}

      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ items ({actions.length})</p>
        {actions.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">Queue is empty.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--color-border)]">
            {actions.map((action) => (
              <li key={action.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-8 text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>#{action.queueOrder}</span>
                  <RiskBadge level={action.riskLevel} />
                  <span
                    className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                      action.status === 'completed'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : action.status === 'failed'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : action.status === 'unverified'
                            ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {action.status}
                  </span>
                  <span className="text-[10px] text-[var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{action.actionType}</span>
                  <span className="text-[var(--color-text-secondary)]">{action.summary}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>#{action.contentHash.slice(0, 10)}</span>

                  <div className="ml-auto flex gap-2">
                    {['approved', 'paused'].includes(action.status) && (
                      <button
                        onClick={() => execute(action.id)}
                        disabled={busy}
                        className="border border-green-600 bg-green-600 px-3 py-0.5 text-xs text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        execute
                      </button>
                    )}
                    {['failed', 'unverified', 'paused'].includes(action.status) && (
                      <button
                        onClick={() => run(() => actionsService.retry(action.id), 'Re-queued for execution')}
                        className="text-xs text-[var(--color-accent)] hover:underline"
                      >
                        retry
                      </button>
                    )}
                    {['approved', 'paused'].includes(action.status) && (
                      <button
                        onClick={() => run(() => actionsService.skip(action.id), 'Action skipped')}
                        className="text-xs text-[var(--color-text-muted)] hover:underline"
                      >
                        skip
                      </button>
                    )}
                    {['approved', 'paused', 'unverified'].includes(action.status) && (
                      <button
                        onClick={() => run(() => actionsService.cancel(action.id), 'Action cancelled')}
                        className="text-xs text-red-500 hover:underline"
                      >
                        cancel
                      </button>
                    )}
                  </div>
                </div>
                {action.lastError && (
                  <p className="mt-1 pl-12 text-xs text-red-600">{action.lastError}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {checklist && (
        <section>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ contract-check (last run)</p>
          <ul className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
            {checklist.checks.map((c, i) => (
              <li key={i} className={c.passed ? 'text-green-600' : 'text-red-600'} style={{ fontFamily: 'var(--font-mono)' }}>
                {String(c.id).padStart(2, '0')} {c.name} {c.passed ? '✓' : `✗ ${c.detail ?? ''}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
