import type { ProfileSnapshot } from '../domain/profile/profile.types.js'

export interface PlanItem {
  section: string
  present: boolean
  quality: 'ok' | 'weak' | 'missing'
  recommendation: string
}

export interface SetupPlan {
  items: PlanItem[]
  missingInformation: string[]
  status: 'READY_FOR_REVIEW' | 'WAITING_FOR_APPROVAL' | 'NEEDS_USER_INPUT'
  note: string
}

function weak(text: string, minLen: number): boolean {
  return text.trim().length > 0 && text.trim().length < minLen
}

/**
 * Planner (flow.md §32): compares source-of-truth state against the profile and produces a
 * plan. It NEVER executes anything — plans wait for review and approval.
 */
export function buildSetupPlan(snapshot: ProfileSnapshot): SetupPlan {
  const items: PlanItem[] = []
  const missing: string[] = []

  const push = (
    section: string,
    present: boolean,
    quality: PlanItem['quality'],
    recommendation: string,
  ): void => {
    items.push({ section, present, quality, recommendation })
    if (!present) missing.push(section)
  }

  push(
    'Headline',
    Boolean(snapshot.headline.trim()),
    snapshot.headline.trim() ? (weak(snapshot.headline, 40) ? 'weak' : 'ok') : 'missing',
    snapshot.headline.trim()
      ? 'Headline exists — consider improving positioning with verified skills.'
      : 'Add a headline derived from your verified role and technologies.',
  )
  push(
    'About',
    Boolean(snapshot.about.trim()),
    snapshot.about.trim() ? (snapshot.about.length < 200 ? 'weak' : 'ok') : 'missing',
    snapshot.about.trim()
      ? 'About exists — ask me to "improve about" for a fact-checked rewrite.'
      : 'Write an About section using only confirmed facts.',
  )
  push(
    'Experience',
    (snapshot.experiences ?? []).length > 0,
    (snapshot.experiences ?? []).some((e) => (e.description ?? '').trim())
      ? 'ok'
      : (snapshot.experiences ?? []).length > 0
        ? 'weak'
        : 'missing',
    (snapshot.experiences ?? []).length > 0
      ? 'Add or improve descriptions for each experience (facts only).'
      : 'Add at least one experience entry.',
  )
  push(
    'Education',
    (snapshot.educations ?? []).length > 0,
    (snapshot.educations ?? []).length > 0 ? 'ok' : 'missing',
    (snapshot.educations ?? []).length > 0 ? 'Education present.' : 'Add your education history.',
  )
  push(
    'Projects',
    (snapshot.projects ?? []).length > 0,
    (snapshot.projects ?? []).some((p) => (p.description ?? '').trim())
      ? 'ok'
      : (snapshot.projects ?? []).length > 0
        ? 'weak'
        : 'missing',
    (snapshot.projects ?? []).length > 0
      ? 'Improve project descriptions from verified facts.'
      : 'Add projects you actually built.',
  )
  push(
    'Skills',
    (snapshot.skills ?? []).length > 0,
    (snapshot.skills ?? []).length >= 5 ? 'ok' : 'weak',
    (snapshot.skills ?? []).length >= 5
      ? 'Skill list looks populated.'
      : 'Add skills that are backed by your verified experience.',
  )
  push(
    'Certifications',
    (snapshot.certifications ?? []).length > 0,
    (snapshot.certifications ?? []).length > 0 ? 'ok' : 'missing',
    (snapshot.certifications ?? []).length > 0
      ? 'Certifications present.'
      : 'Optional: add certifications you actually hold.',
  )

  const hasContent = items.some((i) => i.quality !== 'missing')
  const status: SetupPlan['status'] = !hasContent
    ? 'NEEDS_USER_INPUT'
    : items.every((i) => i.quality !== 'missing')
      ? 'READY_FOR_REVIEW'
      : 'NEEDS_USER_INPUT'

  return {
    items,
    missingInformation: missing,
    status,
    note:
      status === 'NEEDS_USER_INPUT'
        ? 'I need more verified facts before drafting anything. I will not guess.'
        : 'Plan generated. Nothing touches LinkedIn until you explicitly approve each change.',
  }
}
