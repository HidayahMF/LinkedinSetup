import { useCallback, useEffect, useState } from 'react'
import { profileService } from '../services/profile'
import { reviewsService } from '../services/workflow'
import type { ReviewResponse } from '../services/profile'
import { PROFILE_SECTIONS } from '../types/profile'
export default function ReviewPage() {
  const [target, setTarget] = useState<'profile' | string>('profile')
  const [review, setReview] = useState<ReviewResponse | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; target: string; overall: number }>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      const data = await reviewsService.list()
      setHistory(data.reviews.map((r) => ({ id: r.id, target: r.target, overall: r.overall })))
    } catch {
      // history is optional
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const result = await profileService.review(target)
      setReview(result.review)
      await loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h2 className="text-xl font-bold">AI Review</h2>
        <p className="text-sm text-slate-500">
          Read-only analysis. Scores are an AI evaluation, never objective fact (flow.md §31).
        </p>
      </header>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <select
          aria-label="review target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
        >
          <option value="profile">Whole profile</option>
          {PROFILE_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={busy}
          className="rounded bg-sky-600 px-4 py-1 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Run review'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {review && (
        <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div>
            <h3 className="font-semibold">Scores</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.entries(review.scores).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="w-32 text-slate-400">{k}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                    <div
                      className={`h-full ${v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${v}%` }}
                    />
                  </div>
                  <span className="w-14 text-right font-mono text-xs">{v}/100</span>
                </li>
              ))}
              <li className="flex items-center gap-2 border-t border-slate-800 pt-1">
                <span className="w-32 font-medium">Overall</span>
                <span className="font-mono text-sm">{review.overall}/100</span>
              </li>
            </ul>
          </div>

          <ReviewList title="Strengths" tone="text-emerald-300" items={review.strengths} />
          <ReviewList title="Issues" tone="text-amber-300" items={review.issues} />
          <ReviewList title="Unsupported claims" tone="text-rose-300" items={review.unsupportedClaims} />
          <ReviewList title="Missing information" tone="text-sky-300" items={review.missingInformation} />
          <ReviewList title="Recommendations" tone="text-slate-200" items={review.recommendations} />
          <ReviewList title="Optional improvements" tone="text-slate-400" items={review.optionalImprovements} />
        </section>
      )}

      {history.length > 0 && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold">Past reviews</h3>
          <ul className="space-y-1 text-sm text-slate-400">
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="flex justify-between font-mono text-xs">
                <span>{h.target}</span>
                <span>{h.overall}/100</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ReviewList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h4>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
