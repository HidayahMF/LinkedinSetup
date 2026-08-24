import { useCallback, useEffect, useState } from 'react'
import {
  FACT_CATEGORIES,
  FACT_SOURCES,
  FACT_STATUSES,
  FACT_TYPES,
  type FactCategory,
  type FactSource,
  type FactStatus,
  type FactType,
  type ProfileFact,
} from '../types/profileFact'
import { profileFactsService } from '../services/profileFacts'
import { StatusBadge, TypeBadge } from '../components/factBadges'

const inputClass =
  'border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

export default function ProfileFactsPage() {
  const [facts, setFacts] = useState<ProfileFact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [form, setForm] = useState({
    type: 'fact' as FactType,
    category: 'identity' as FactCategory,
    key: '',
    value: '',
    status: 'verified' as FactStatus,
    source: 'user_profile' as FactSource,
    sourceReference: '',
  })

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await profileFactsService.list()
      setFacts(data.facts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load facts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    try {
      await profileFactsService.create({
        ...form,
        sourceReference: form.sourceReference || undefined,
      })
      setNotice('Fact created')
      setForm({ ...form, key: '', value: '', sourceReference: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create fact')
    }
  }

  async function handleSaveEdit(id: string) {
    setError(null)
    try {
      await profileFactsService.update(id, { value: editValue })
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fact')
    }
  }

  async function handleDelete(fact: ProfileFact) {
    if (!window.confirm(`Delete fact "${fact.key}"?`)) return
    setError(null)
    try {
      await profileFactsService.remove(fact.id)
      setNotice('Fact deleted')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete fact')
    }
  }

  if (loading) return <p className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>loading…</p>

  return (
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ source-of-truth</p>
        <h1 className="text-2xl font-bold tracking-tight">Source of Truth</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Verified profile facts. AI treats these as ground truth.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {/* Create form */}
      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ add-fact</p>
        <form onSubmit={handleCreate} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <select
            aria-label="type"
            className={inputClass}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as FactType })}
          >
            {FACT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="category"
            className={inputClass}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as FactCategory })}
          >
            {FACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            aria-label="key"
            placeholder="key (e.g. role, company)"
            className={inputClass}
            style={{ fontFamily: 'var(--font-mono)' }}
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
          <select
            aria-label="status"
            className={inputClass}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as FactStatus })}
          >
            {FACT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <textarea
            aria-label="value"
            placeholder="value — only what is true; never guess"
            rows={2}
            className={`${inputClass} md:col-span-2`}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <select
            aria-label="source"
            className={inputClass}
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as FactSource })}
          >
            {FACT_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            type="submit"
            className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
          >
            Add fact
          </button>
        </form>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Non-authoritative types (inference / generated) cannot be saved as verified.
        </p>
      </section>

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      {/* Facts list */}
      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ list-facts ({facts.length})</p>
        {facts.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">No facts yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--color-border)]">
            {facts.map((fact) => (
              <li key={fact.id} className="flex flex-wrap items-center gap-2 py-3">
                <TypeBadge type={fact.type} />
                <StatusBadge status={fact.status} />
                <span className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{fact.category}</span>
                <span className="text-sm font-medium text-[var(--color-text)]">{fact.key}</span>
                {editingId === fact.id ? (
                  <>
                    <input
                      aria-label="edit value"
                      className={`${inputClass} flex-1`}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                    <button
                      className="text-sm text-green-600 hover:underline"
                      onClick={() => handleSaveEdit(fact.id)}
                    >
                      save
                    </button>
                    <button
                      className="text-sm text-[var(--color-text-muted)] hover:underline"
                      onClick={() => setEditingId(null)}
                    >
                      cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-[var(--color-text-secondary)]">{String(fact.value)}</span>
                    <button
                      className="text-sm text-[var(--color-accent)] hover:underline"
                      onClick={() => {
                        setEditingId(fact.id)
                        setEditValue(String(fact.value))
                      }}
                    >
                      edit
                    </button>
                    <button
                      className="text-sm text-red-500 hover:underline"
                      onClick={() => handleDelete(fact)}
                    >
                      delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
