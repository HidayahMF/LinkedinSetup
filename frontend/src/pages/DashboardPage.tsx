import { useEffect, useState } from 'react'
import { profileService } from '../services/profile'
import type { Profile } from '../types/profile'

export default function DashboardPage({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    profileService.get().then(({ profile }) => {
      setProfile(profile)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>loading…</p>

  const filled = [
    profile!.headline?.trim(),
    profile!.about?.trim(),
    profile!.experiences?.length ? 'x' : '',
    profile!.educations?.length ? 'x' : '',
    profile!.projects?.length ? 'x' : '',
    profile!.skills?.length ? 'x' : '',
    profile!.certifications?.length ? 'x' : '',
    profile!.featured?.length ? 'x' : '',
  ].filter(Boolean).length

  return (
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ whoami</p>
        <h1 className="text-2xl font-bold tracking-tight">LinkedIn AI Assistant</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Tell me what you want to improve on your LinkedIn profile.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h2 className="text-lg font-medium mb-3">Your LinkedIn</h2>
          <div className="mt-4">
            <p className="text-3xl font-bold">{filled} / 8</p>
            <p className="text-sm text-[var(--color-text-muted)]">Profile completion</p>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Needs attention:</p>
            <ul className="mt-3 space-y-1 text-sm">
              {!profile!.headline?.trim() && <li>Headline</li>}
              {!profile!.about?.trim() && <li>About</li>}
              {profile!.experiences?.length === 0 && <li>Experience</li>}
            </ul>
            <button
              onClick={() => onNavigate('agent')}
              className="mt-3 border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg-alt)] transition"
            >
              Improve my profile
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium mb-3">Quick actions</h2>
          <div className="space-y-3">
            <button
              onClick={() => onNavigate('agent')}
              className="border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition"
            >
              Improve my headline
            </button>
            <button
              onClick={() => onNavigate('agent')}
              className="border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition"
            >
              Improve my About
            </button>
            <button
              onClick={() => onNavigate('agent')}
              className="border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition"
            >
              Review my profile
            </button>
            <button
              onClick={() => onNavigate('agent')}
              className="border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition"
            >
              Create a post
            </button>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ recent activity</p>
        <div className="mt-4 space-y-1 text-sm">
          <div className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-bg-alt)]">
            <span className="text-[var(--color-text-secondary)]">Headline updated</span>
          </div>
          <div className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-bg-alt)]">
            <span className="text-[var(--color-text-secondary)]">About draft created</span>
          </div>
          <div className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-bg-alt)]">
            <span className="text-[var(--color-text-secondary)]">Post approved</span>
          </div>
        </div>
      </section>
    </div>
  )
}