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
    <div className="max-w-3xl space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ review</p>
        <h1 className="text-2xl font-bold tracking-tight">AI Review</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Read-only analysis. Scores are an AI evaluation, never objective fact (flow.md §31).
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="review target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
        >
          <option value="profile">Whole profile</option>
          {PROFILE_SECTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={busy}
          className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Run review'}
        </button>
      </div>

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {review && (
        <section className="space-y-6">
          {/* Scores */}
          <div>
            <p className="mb-3 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ scores</p>
            <ul className="space-y-2 text-sm">
              {Object.entries(review.scores).map(([k, v]) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-36 text-[var(--color-text-secondary)]">{k}</span>
                  <div className="h-1.5 flex-1 overflow-hidden bg-[var(--color-border)]">
                    <div
                      className={`h-full ${v >= 70 ? 'bg-green-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${v}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{v}/100</span>
                </li>
              ))}
              <li className="flex items-center gap-3 border-t border-[var(--color-border)] pt-2">
                <span className="w-36 font-medium text-[var(--color-text)]">Overall</span>
                <span className="text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{review.overall}/100</span>
              </li>
            </ul>
          </div>

          <hr className="border-[var(--color-border)]" />

          <ReviewList title="Strengths" tone="text-green-600" items={review.strengths} />
          <ReviewList title="Issues" tone="text-amber-600" items={review.issues} />
          <ReviewList title="Unsupported claims" tone="text-red-600" items={review.unsupportedClaims} />
          <ReviewList title="Missing information" tone="text-[var(--color-accent)]" items={review.missingInformation} />
          <ReviewList title="Recommendations" tone="text-[var(--color-text)]" items={review.recommendations} />
          <ReviewList title="Optional improvements" tone="text-[var(--color-text-muted)]" items={review.optionalImprovements} />
        </section>
      )}

      {history.length > 0 && (
        <section>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ history</p>
          <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]">
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="flex justify-between text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
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
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${tone}`} style={{ fontFamily: 'var(--font-mono)' }}>{title}</h4>
      <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-[var(--color-text-secondary)]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
