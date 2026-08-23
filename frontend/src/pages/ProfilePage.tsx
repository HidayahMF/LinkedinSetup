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
  'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

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

  if (!profile) return <p className="text-slate-400">{error ?? 'Loading…'}</p>

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold">Profile</h2>
        <p className="text-sm text-slate-500">
          Direct edits create a NEW version — history is never overwritten. Facts you write here are
          yours; AI will treat them as source of truth only after verification in Source of Truth.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}
      {changes && changes.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Last saved changes</h3>
          <DiffView changes={changes} />
        </section>
      )}

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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
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
    <Card title="Headline & About">
      <div className="space-y-3">
        <label className="block text-sm text-slate-400">
          Headline ({headline.length}/220)
          <input className={`${input} mt-1 w-full`} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </label>
        <label className="block text-sm text-slate-400">
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
          className="rounded bg-sky-600 px-4 py-1 text-sm font-medium hover:bg-sky-500"
        >
          Save headline/about
        </button>
      </div>
    </Card>
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
    <Card title={`Experience (${profile.experiences.length})`}>
      <ul className="mb-4 space-y-2">
        {profile.experiences.map((item) => (
          <li key={item.id} className="rounded border border-slate-800 p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.role}</span>
              <span className="text-slate-400">@ {item.company}</span>
              <span className="font-mono text-xs text-slate-600">
                {item.startDate ?? '?'} → {item.current ? 'present' : (item.endDate ?? '?')}
              </span>
              <button onClick={() => removeItem(item.id)} className="ml-auto text-xs text-rose-400 hover:underline">
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
        <button onClick={addItem} className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Add experience
        </button>
      </div>
    </Card>
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
    <Card title={`Education (${profile.educations.length})`}>
      <ul className="mb-3 space-y-1 text-sm">
        {profile.educations.map((item: EducationItem) => (
          <li key={item.id} className="flex items-center gap-2">
            <span>{item.degree ?? ''}</span>
            <span className="font-medium">{item.school}</span>
            <button
              onClick={() => onSave({ educations: profile.educations.filter((e) => e.id !== item.id) }, 'Education')}
              className="ml-auto text-xs text-rose-400 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="school" placeholder="school*" className={input} value={school} onChange={(e) => setSchool(e.target.value)} />
        <input aria-label="degree" placeholder="degree" className={input} value={degree} onChange={(e) => setDegree(e.target.value)} />
        <button onClick={addItem} className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Add education
        </button>
      </div>
    </Card>
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
    <Card title={`Projects (${profile.projects.length})`}>
      <ul className="mb-3 space-y-2">
        {profile.projects.map((item) => (
          <li key={item.id} className="rounded border border-slate-800 p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.name}</span>
              <button
                onClick={() => onSave({ projects: profile.projects.filter((p) => p.id !== item.id) }, 'Projects')}
                className="ml-auto text-xs text-rose-400 hover:underline"
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
        <button onClick={addItem} className="col-span-2 rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Add project
        </button>
      </div>
    </Card>
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
    <Card title={`Skills (${profile.skills.length})`}>
      <ul className="mb-3 flex flex-wrap gap-2">
        {profile.skills.map((s) => (
          <li key={s.id} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-sm">
            {s.name}
            <button
              onClick={() => onSave({ skills: profile.skills.filter((x) => x.id !== s.id) }, 'Skills')}
              className="text-xs text-rose-400"
              aria-label={`remove ${s.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="skill name" placeholder="skill*" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={addItem} className="col-span-2 rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Add skill
        </button>
      </div>
    </Card>
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
    <Card title={`Certifications (${profile.certifications.length})`}>
      <ul className="mb-3 space-y-1 text-sm">
        {profile.certifications.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="font-medium">{c.name}</span>
            <span className="text-slate-500">{c.issuer ?? ''}</span>
            <button
              onClick={() => onSave({ certifications: profile.certifications.filter((x) => x.id !== c.id) }, 'Certifications')}
              className="ml-auto text-xs text-rose-400 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 gap-2">
        <input aria-label="certification name" placeholder="name*" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="issuer" placeholder="issuer" className={input} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        <button onClick={addItem} className="col-span-2 rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Add certification
        </button>
      </div>
    </Card>
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
    <Card title={`Featured (${profile.featured.length})`}>
      <ul className="mb-3 space-y-1 text-sm">
        {profile.featured.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <span className="font-medium">{f.title}</span>
            {f.url && <a href={f.url} className="truncate text-xs text-sky-400 underline">{f.url}</a>}
            <button
              onClick={() => onSave({ featured: profile.featured.filter((x) => x.id !== f.id) }, 'Featured')}
              className="ml-auto text-xs text-rose-400 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 gap-2">
        <input aria-label="featured title" placeholder="title*" className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="featured url" placeholder="url" className={`${input} col-span-2`} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={addItem} className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Add featured
        </button>
      </div>
    </Card>
  )
}
