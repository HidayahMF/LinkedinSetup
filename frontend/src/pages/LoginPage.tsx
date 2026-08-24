import { useState } from 'react'
import { login, register } from '../services/auth'

const inputClass =
  'w-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

export default function LoginPage({
  onAuthenticated,
}: {
  onAuthenticated: (user: { id: string; email: string }) => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = mode === 'login' ? await login(email, password) : await register(email, password)
      onAuthenticated(user)
    } catch (err) {
      setError((err as Error).message || 'authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="w-full max-w-sm space-y-6">
        <header>
          <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            $ auth --{mode}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">~/linkedin-agent</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Sign in to your workspace. Every profile fact, proposal and approval is strictly scoped to this account.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Email
            <input
              aria-label="email"
              type="email"
              required
              autoComplete="email"
              className={`${inputClass} mt-1`}
              style={{ fontFamily: 'var(--font-mono)' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Password
            <input
              aria-label="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={`${inputClass} mt-1`}
              style={{ fontFamily: 'var(--font-mono)' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p role="alert" className="border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="text-center text-xs text-[var(--color-text-muted)]">
            {mode === 'login' ? 'No account yet?' : 'Already registered?'}{' '}
            <button
              type="button"
              className="text-[var(--color-accent)] hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError(null)
              }}
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
