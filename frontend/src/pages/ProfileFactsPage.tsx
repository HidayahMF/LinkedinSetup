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
  'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

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

  if (loading) return <p className="p-6 text-slate-400">Loading…</p>

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 font-semibold text-slate-200">Add verified profile fact</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <select
            aria-label="type"
            className={inputClass}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as FactType })}
          >
            {FACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="category"
            className={inputClass}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as FactCategory })}
          >
            {FACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            aria-label="key"
            placeholder="key (e.g. role, company)"
            className={inputClass}
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
              <option key={s} value={s}>
                {s}
              </option>
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
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-sky-600 px-4 py-1 text-sm font-medium text-white hover:bg-sky-500"
          >
            Add fact
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Non-authoritative types (inference / generated) cannot be saved as verified.
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 font-semibold text-slate-200">Facts ({facts.length})</h2>
        {facts.length === 0 ? (
          <p className="text-sm text-slate-500">No facts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {facts.map((fact) => (
              <li key={fact.id} className="flex flex-wrap items-center gap-3 py-2">
                <TypeBadge type={fact.type} />
                <StatusBadge status={fact.status} />
                <span className="font-mono text-xs text-slate-400">{fact.category}</span>
                <span className="font-medium text-slate-200">{fact.key}</span>
                {editingId === fact.id ? (
                  <>
                    <input
                      aria-label="edit value"
                      className={inputClass}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                    <button
                      className="text-sm text-emerald-400 hover:underline"
                      onClick={() => handleSaveEdit(fact.id)}
                    >
                      save
                    </button>
                    <button
                      className="text-sm text-slate-400 hover:underline"
                      onClick={() => setEditingId(null)}
                    >
                      cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-slate-300">{String(fact.value)}</span>
                    <button
                      className="text-sm text-sky-400 hover:underline"
                      onClick={() => {
                        setEditingId(fact.id)
                        setEditValue(String(fact.value))
                      }}
                    >
                      edit
                    </button>
                    <button
                      className="text-sm text-rose-400 hover:underline"
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
