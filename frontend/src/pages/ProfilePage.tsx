import { useEffect, useState } from 'react'
import { profileService } from '../services/profile'
import type { FieldDiff } from '../types/profile'
import type {
  CertificationItem,
  EducationItem,
  ExperienceItem,
  FeaturedItem,
  Profile,
  ProjectItem,
  SkillItem,
} from '../types/profile'
import { DiffView } from '../components/DiffView'

const input =
  'border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [changes, setChanges] = useState<FieldDiff[] | null>(null)

  async function load() {
    try {
      const data = await profileService.get()
      setProfile(data.profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function save(payload: Record<string, unknown>, label: string) {
    setError(null)
    setNotice(null)
    try {
      const result = await profileService.update(payload)
      setProfile(result.profile)
      setChanges(result.changes)
      setNotice(`${label} saved as version ${result.versionNumber}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profile')
    }
  }

  if (!profile) return <p className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{error ?? 'loading…'}</p>

  return (
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ profile</p>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Direct edits create a NEW version — history is never overwritten. Facts you write here are
          yours; AI will treat them as source of truth only after verification in Source of Truth.
        </p>
      </header>

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-600">{notice}</p>}
      {changes && changes.length > 0 && (
        <section>
          <p className="mb-2 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ last-diff</p>
          <DiffView changes={changes} />
        </section>
      )}

      <hr className="border-[var(--color-border)]" />

      <HeadlineAboutSection profile={profile} onSave={save} />
      <ExperiencesSection profile={profile} onSave={save} />
      <EducationsSection profile={profile} onSave={save} />
      <ProjectsSection profile={profile} onSave={save} />
      <SkillsSection profile={profile} onSave={save} />
      <CertificationsSection profile={profile} onSave={save} />
      <FeaturedSection profile={profile} onSave={save} />
    </div>
  )
}

type SaveFn = (payload: Record<string, unknown>, label: string) => Promise<void>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ {title}</p>
      <div className="mt-4">{children}</div>
      <hr className="mt-10 border-[var(--color-border)]" />
    </section>
  )
}

function HeadlineAboutSection({
  profile,
  onSave,
}: {
  profile: Profile
  onSave: SaveFn
}) {
  const [headline, setHeadline] = useState(profile.headline)
  const [about, setAbout] = useState(profile.about)

  useEffect(() => {
    setHeadline(profile.headline)
    setAbout(profile.about)
  }, [profile.headline, profile.about])

  return (
    <Section title="headline-about">
      <div className="space-y-3">
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Headline ({headline.length}/220)
          <input className={`${input} mt-1 w-full`} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </label>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          About
          <textarea
            rows={5}
            className={`${input} mt-1 w-full`}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
          />
        </label>
        <button
          onClick={() =>
            onSave(
              {
                ...(headline !== profile.headline ? { headline } : {}),
                ...(about !== profile.about ? { about } : {}),
              },
              'Profile',
            )
          }
          className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          Save headline/about
        </button>
      </div>
    </Section>
  )
}

function ExperiencesSection({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  const [draft, setDraft] = useState<ExperienceItem>({
    id: '',
    company: '',
    role: '',
    startDate: '',
    endDate: '',
    description: '',
  })

  function addItem() {
    if (!draft.company.trim() || !draft.role.trim()) return
    const next: ExperienceItem[] = [
      ...profile.experiences,
      { ...draft, id: uid(), startDate: draft.startDate || null, endDate: draft.endDate || null },
    ]
    onSave({ experiences: next }, 'Experience')
    setDraft({ id: '', company: '', role: '', startDate: '', endDate: '', description: '' })
  }

  function updateDescription(item: ExperienceItem, description: string) {
    const next = profile.experiences.map((e) => (e.id === item.id ? { ...e, description } : e))
    onSave({ experiences: next }, 'Experience')
  }

  function removeItem(id: string) {
    if (!window.confirm('Remove this experience from your local profile?')) return
    onSave({ experiences: profile.experiences.filter((e) => e.id !== id) }, 'Experience')
  }

  return (
    <Section title={`experience (${profile.experiences.length})`}>
      <ul className="mb-4 space-y-3">
        {profile.experiences.map((item) => (
          <li key={item.id} className="border border-[var(--color-border)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[var(--color-text)]">{item.role}</span>
              <span className="text-[var(--color-text-secondary)]">@ {item.company}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {item.startDate ?? '?'} → {item.current ? 'present' : (item.endDate ?? '?')}
              </span>
              <button onClick={() => removeItem(item.id)} className="ml-auto text-xs text-red-500 hover:underline">
                remove
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="description (facts only)"
              className={`${input} mt-2 w-full`}
              value={item.description ?? ''}
              onChange={(e) => updateDescription(item, e.target.value)}
            />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <input aria-label="company" placeholder="company*" className={input} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
        <input aria-label="role" placeholder="role*" className={input} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
        <input aria-label="start date" placeholder="start YYYY-MM" className={input} value={draft.startDate ?? ''} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
        <input aria-label="end date" placeholder="end YYYY-MM" className={input} value={draft.endDate ?? ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
        <button onClick={addItem} className="border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
          Add experience
        </button>
      </div>
    </Section>
  )
}

function EducationsSection({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  const [school, setSchool] = useState('')
  const [degree, setDegree] = useState('')

  function addItem() {
    if (!school.trim()) return
    onSave({ educations: [...profile.educations, { id: uid(), school, degree: degree || null }] }, 'Education')
    setSchool('')
    setDegree('')
  }

  return (
    <Section title={`education (${profile.educations.length})`}>
      <ul className="mb-3 space-y-1 text-sm">
        {profile.educations.map((item: EducationItem) => (
          <li key={item.id} className="flex items-center gap-2">
            <span>{item.degree ?? ''}</span>
            <span className="font-medium text-[var(--color-text)]">{item.school}</span>
            <button
              onClick={() => onSave({ educations: profile.educations.filter((e) => e.id !== item.id) }, 'Education')}
              className="ml-auto text-xs text-red-500 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="school" placeholder="school*" className={input} value={school} onChange={(e) => setSchool(e.target.value)} />
        <input aria-label="degree" placeholder="degree" className={input} value={degree} onChange={(e) => setDegree(e.target.value)} />
        <button onClick={addItem} className="border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
          Add education
        </button>
      </div>
    </Section>
  )
}

function ProjectsSection({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  const [name, setName] = useState('')

  function addItem() {
    if (!name.trim()) return
    const project: ProjectItem = { id: uid(), name }
    onSave({ projects: [...profile.projects, project] }, 'Projects')
    setName('')
  }

  function updateDescription(item: ProjectItem, description: string) {
    const next = profile.projects.map((p) => (p.id === item.id ? { ...p, description } : p))
    onSave({ projects: next }, 'Projects')
  }

  return (
    <Section title={`projects (${profile.projects.length})`}>
      <ul className="mb-3 space-y-3">
        {profile.projects.map((item) => (
          <li key={item.id} className="border border-[var(--color-border)] p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--color-text)]">{item.name}</span>
              <button
                onClick={() => onSave({ projects: profile.projects.filter((p) => p.id !== item.id) }, 'Projects')}
                className="ml-auto text-xs text-red-500 hover:underline"
              >
                remove
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="description (facts only)"
              className={`${input} mt-2 w-full`}
              value={item.description ?? ''}
              onChange={(e) => updateDescription(item, e.target.value)}
            />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="project name" placeholder="project name*" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={addItem} className="col-span-2 border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
          Add project
        </button>
      </div>
    </Section>
  )
}

function SkillsSection({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  const [name, setName] = useState('')

  function addItem() {
    if (!name.trim()) return
    const skill: SkillItem = { id: uid(), name: name.trim() }
    onSave({ skills: [...profile.skills, skill] }, 'Skills')
    setName('')
  }

  return (
    <Section title={`skills (${profile.skills.length})`}>
      <ul className="mb-3 flex flex-wrap gap-2">
        {profile.skills.map((s) => (
          <li key={s.id} className="flex items-center gap-1 border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-2 py-0.5 text-sm">
            {s.name}
            <button
              onClick={() => onSave({ skills: profile.skills.filter((x) => x.id !== s.id) }, 'Skills')}
              className="text-xs text-red-500"
              aria-label={`remove ${s.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="skill name" placeholder="skill*" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={addItem} className="col-span-2 border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
          Add skill
        </button>
      </div>
    </Section>
  )
}

function CertificationsSection({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')

  function addItem() {
    if (!name.trim()) return
    const cert: CertificationItem = { id: uid(), name, issuer: issuer || null }
    onSave({ certifications: [...profile.certifications, cert] }, 'Certifications')
    setName('')
    setIssuer('')
  }

  return (
    <Section title={`certifications (${profile.certifications.length})`}>
      <ul className="mb-3 space-y-1 text-sm">
        {profile.certifications.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text)]">{c.name}</span>
            <span className="text-[var(--color-text-muted)]">{c.issuer ?? ''}</span>
            <button
              onClick={() => onSave({ certifications: profile.certifications.filter((x) => x.id !== c.id) }, 'Certifications')}
              className="ml-auto text-xs text-red-500 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 gap-2">
        <input aria-label="certification name" placeholder="name*" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="issuer" placeholder="issuer" className={input} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        <button onClick={addItem} className="col-span-2 border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
          Add certification
        </button>
      </div>
    </Section>
  )
}

function FeaturedSection({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  function addItem() {
    if (!title.trim()) return
    const item: FeaturedItem = { id: uid(), title, url: url.trim() || null }
    onSave({ featured: [...profile.featured, item] }, 'Featured')
    setTitle('')
    setUrl('')
  }

  return (
    <Section title={`featured (${profile.featured.length})`}>
      <ul className="mb-3 space-y-1 text-sm">
        {profile.featured.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text)]">{f.title}</span>
            {f.url && <a href={f.url} className="truncate text-xs text-[var(--color-accent)] underline">{f.url}</a>}
            <button
              onClick={() => onSave({ featured: profile.featured.filter((x) => x.id !== f.id) }, 'Featured')}
              className="ml-auto text-xs text-red-500 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 gap-2">
        <input aria-label="featured title" placeholder="title*" className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="featured url" placeholder="url" className={`${input} col-span-2`} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={addItem} className="border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
          Add featured
        </button>
      </div>
    </Section>
  )
}
