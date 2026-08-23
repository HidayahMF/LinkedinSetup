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
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Action Queue</h2>
          <p className="text-sm text-slate-500">
            Executor only takes APPROVED items. Every run passes a 21-check contract and is audited.
          </p>
        </div>
        <button
          onClick={() =>
            run(() => actionsService.runQueue(), 'Queue run finished. Unverified results halt the queue for review.')
          }
          disabled={busy}
          className="ml-auto rounded bg-sky-600 px-4 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          Run approved queue
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-300">{notice}</p>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        {actions.length === 0 ? (
          <p className="text-sm text-slate-500">Queue is empty.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {actions.map((action) => (
              <li key={action.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-8 font-mono text-xs text-slate-600">#{action.queueOrder}</span>
                  <RiskBadge level={action.riskLevel} />
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-xs uppercase ${
                      action.status === 'completed'
                        ? 'bg-emerald-800 text-emerald-100'
                        : action.status === 'failed'
                          ? 'bg-rose-900 text-rose-200'
                          : action.status === 'unverified'
                            ? 'bg-yellow-800 text-yellow-100'
                            : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {action.status}
                  </span>
                  <span className="font-mono text-xs text-sky-300">{action.actionType}</span>
                  <span className="text-slate-400">{action.summary}</span>
                  <span className="font-mono text-[10px] text-slate-600">#{action.contentHash.slice(0, 10)}</span>

                  <div className="ml-auto flex gap-1">
                    {['approved', 'paused'].includes(action.status) && (
                      <button
                        onClick={() => execute(action.id)}
                        disabled={busy}
                        className="rounded bg-emerald-700 px-3 py-0.5 text-xs hover:bg-emerald-600 disabled:opacity-40"
                      >
                        execute
                      </button>
                    )}
                    {['failed', 'unverified', 'paused'].includes(action.status) && (
                      <button
                        onClick={() => run(() => actionsService.retry(action.id), 'Re-queued for execution')}
                        className="text-xs text-emerald-300 hover:underline"
                      >
                        retry
                      </button>
                    )}
                    {['approved', 'paused'].includes(action.status) && (
                      <button
                        onClick={() => run(() => actionsService.skip(action.id), 'Action skipped')}
                        className="text-xs text-slate-400 hover:underline"
                      >
                        skip
                      </button>
                    )}
                    {['approved', 'paused', 'unverified'].includes(action.status) && (
                      <button
                        onClick={() => run(() => actionsService.cancel(action.id), 'Action cancelled')}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        cancel
                      </button>
                    )}
                  </div>
                </div>
                {action.lastError && (
                  <p className="mt-1 pl-12 text-xs text-rose-300">{action.lastError}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {checklist && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold">Final Execution Contract — last run</h3>
          <ul className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
            {checklist.checks.map((c, i) => (
              <li key={i} className={c.passed ? 'text-emerald-400' : 'text-rose-300'}>
                {String(c.id).padStart(2, '0')} {c.name} {c.passed ? '✓' : `✗ ${c.detail ?? ''}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
