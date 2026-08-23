import { randomBytes } from 'node:crypto'
import { validateTextAgainstFacts, type ClaimCheck } from '../domain/fact-validation/factValidation.service.js'
import type { ProfileSectionName, ProfileSnapshot } from '../domain/profile/profile.types.js'
import type { PlannedActionDraft } from '../execution/actionTypes.js'
import { RISK_MATRIX } from '../execution/actionTypes.js'

export interface ImprovementResult {
  status: 'ready' | 'needs_user_input'
  title: string
  targetField: string
  itemId?: string | null
  before: string
  after: string
  removedSentences: string[]
  matchedFactKeys: string[]
  changes: Array<{
    field: string
    before: unknown
    after: unknown
    reason: string
    supportedFacts: string[]
    unsupportedClaims: string[]
  }>
  plannedActions: PlannedActionDraft[]
  questions: string[]
}

function newActionId(): string {
  return `act_${randomBytes(8).toString('hex')}`
}

export function sectionTargetField(
  target: ProfileSectionName,
  itemId?: string | null,
): string {
  return itemId ? `${target}:${itemId}` : target
}

interface SectionProse {
  text: string
  meta: Record<string, unknown>
}

/**
 * Extracts the improvable prose for a section. Only existing, user-owned content is touched;
 * nothing is ever added from AI imagination.
 */
export function extractSectionProse(
  snapshot: ProfileSnapshot,
  target: ProfileSectionName,
  itemId?: string | null,
): SectionProse | null {
  switch (target) {
    case 'headline':
      return { text: snapshot.headline ?? '', meta: {} }
    case 'about':
      return { text: snapshot.about ?? '', meta: {} }
    case 'experiences': {
      const item = (snapshot.experiences ?? []).find((e) => e.id === itemId)
      if (!item) return null
      return {
        text: item.description ?? '',
        meta: { company: item.company, role: item.role },
      }
    }
    case 'projects': {
      const item = (snapshot.projects ?? []).find((p) => p.id === itemId)
      if (!item) return null
      return { text: item.description ?? '', meta: { name: item.name } }
    }
    case 'educations': {
      const item = (snapshot.educations ?? []).find((e) => e.id === itemId)
      if (!item) return null
      return { text: item.description ?? '', meta: { school: item.school } }
    }
    default:
      return null
  }
}

function cleanupSentences(sentences: string[]): string {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const raw of sentences) {
    const s = raw.trim().replace(/\s+/g, ' ')
    if (!s) continue
    const normalized = s.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    kept.push(s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : `${s}.`)
  }
  return kept.join(' ')
}

/**
 * Deterministic improvement pass (flow.md §29):
 * - preserves every supported statement verbatim (wording-level cleanup only)
 * - removes statements that are not backed by verified facts
 * - never introduces new facts, metrics, or professional claims
 */
export async function improveSection(
  userId: string,
  snapshot: ProfileSnapshot,
  target: ProfileSectionName,
  itemId?: string | null,
): Promise<ImprovementResult> {
  const targetField = sectionTargetField(target, itemId)
  const base: ImprovementResult = {
    status: 'ready',
    title: `Improve ${targetField}`,
    targetField,
    itemId: itemId ?? null,
    before: '',
    after: '',
    removedSentences: [],
    matchedFactKeys: [],
    changes: [],
    plannedActions: [],
    questions: [],
  }

  const prose = extractSectionProse(snapshot, target, itemId)
  if (!prose) {
    return {
      ...base,
      status: 'needs_user_input',
      questions: [
        itemId
          ? `I could not find "${itemId}" inside ${target}. Which item should be improved?`
          : `There is no content in ${target} yet. Provide the verified facts first (company, role, dates, technologies) and I will draft from them.`,
      ],
    }
  }

  const current = prose.text.trim()
  if (!current) {
    return {
      ...base,
      status: 'needs_user_input',
      questions: [
        `${target}${itemId ? ` (${itemId})` : ''} is empty. Share what is factually true and I will prepare a draft — I will not invent anything.`,
      ],
    }
  }

  const validation = await validateTextAgainstFacts(userId, current)
  const supportedSentences = validation.claims
    .filter((c: ClaimCheck) => c.status === 'supported')
    .map((c) => c.claim)
  const removedSentences = validation.claims
    .filter((c: ClaimCheck) => c.status !== 'supported')
    .map((c) => c.claim)
  const matchedIds = new Set<string>()
  for (const claim of validation.claims) {
    for (const id of claim.matchedFactIds) matchedIds.add(id)
  }

  const improved = cleanupSentences(supportedSentences)
  if (!improved) {
    return {
      ...base,
      status: 'needs_user_input',
      before: current,
      removedSentences,
      questions: [
        'Every sentence in this section contains claims that are not backed by verified facts. Confirm the missing facts (or correct them) and I will rebuild the section.',
      ],
    }
  }

  const changes: ImprovementResult['changes'] = [
    {
      field: targetField,
      before: current,
      after: improved,
      reason: removedSentences.length
        ? `Wording cleanup; removed ${removedSentences.length} unverified statement(s)`
        : 'Wording cleanup without changing any facts',
      supportedFacts: [...matchedIds],
      unsupportedClaims: removedSentences,
    },
  ]

  let plannedActions: PlannedActionDraft[] = []
  if (target === 'headline') {
    plannedActions = [
      {
        actionId: newActionId(),
        actionType: 'update_headline',
        riskLevel: RISK_MATRIX.update_headline,
        targetField,
        summary: 'Update headline on LinkedIn',
        payload: { headline: improved },
      },
    ]
  } else if (target === 'about') {
    plannedActions = [
      {
        actionId: newActionId(),
        actionType: 'update_about',
        riskLevel: RISK_MATRIX.update_about,
        targetField,
        summary: 'Update About section on LinkedIn',
        payload: { about: improved },
      },
    ]
  } else if (target === 'experiences' && itemId) {
    const exp = snapshot.experiences.find((e) => e.id === itemId)!
    plannedActions = [
      {
        actionId: newActionId(),
        actionType: 'edit_experience',
        riskLevel: RISK_MATRIX.edit_experience,
        targetField,
        summary: `Edit experience ${exp.company} — ${exp.role}`,
        payload: {
          itemId,
          company: exp.company,
          role: exp.role,
          description: improved,
        },
      },
    ]
  } else if (target === 'projects' && itemId) {
    const proj = snapshot.projects.find((p) => p.id === itemId)!
    plannedActions = [
      {
        actionId: newActionId(),
        actionType: 'edit_project',
        riskLevel: RISK_MATRIX.edit_project,
        targetField,
        summary: `Edit project ${proj.name}`,
        payload: {
          itemId,
          name: proj.name,
          description: improved,
        },
      },
    ]
  } else if (target === 'educations' && itemId) {
    const edu = snapshot.educations.find((e) => e.id === itemId)!
    plannedActions = [
      {
        actionId: newActionId(),
        actionType: 'edit_education',
        riskLevel: RISK_MATRIX.edit_education,
        targetField,
        summary: `Edit education ${edu.school}`,
        payload: {
          itemId,
          school: edu.school,
          degree: edu.degree ?? null,
          description: improved,
        },
      },
    ]
  } else {
    return {
      ...base,
      status: 'needs_user_input',
      before: current,
      questions: [`${target} has no direct prose editor. Manage its items through the profile editor.`],
    }
  }

  return {
    ...base,
    before: current,
    after: improved,
    removedSentences,
    matchedFactKeys: [...matchedIds],
    changes,
    plannedActions,
  }
}

/** Rebuilds planned-action payloads after a USER EDIT so the executable payload matches the edited content exactly (flow.md §40.1). */
export function repackPlannedActionPayload(
  target: ProfileSectionName,
  itemId: string | null | undefined,
  editedAfter: unknown,
  snapshot: ProfileSnapshot,
): PlannedActionDraft[] | null {
  const text = String(editedAfter ?? '').trim()
  if (!text) return null
  if (target === 'headline') {
    return [
      {
        actionId: newActionId(),
        actionType: 'update_headline',
        riskLevel: RISK_MATRIX.update_headline,
        targetField: 'headline',
        summary: 'Update headline on LinkedIn',
        payload: { headline: text },
      },
    ]
  }
  if (target === 'about') {
    return [
      {
        actionId: newActionId(),
        actionType: 'update_about',
        riskLevel: RISK_MATRIX.update_about,
        targetField: 'about',
        summary: 'Update About section on LinkedIn',
        payload: { about: text },
      },
    ]
  }
  if (target === 'experiences' && itemId) {
    const exp = snapshot.experiences.find((e) => e.id === itemId)
    if (!exp) return null
    return [
      {
        actionId: newActionId(),
        actionType: 'edit_experience',
        riskLevel: RISK_MATRIX.edit_experience,
        targetField: sectionTargetField('experiences', itemId),
        summary: `Edit experience ${exp.company} — ${exp.role}`,
        payload: { itemId, company: exp.company, role: exp.role, description: text },
      },
    ]
  }
  if (target === 'projects' && itemId) {
    const proj = snapshot.projects.find((p) => p.id === itemId)
    if (!proj) return null
    return [
      {
        actionId: newActionId(),
        actionType: 'edit_project',
        riskLevel: RISK_MATRIX.edit_project,
        targetField: sectionTargetField('projects', itemId),
        summary: `Edit project ${proj.name}`,
        payload: { itemId, name: proj.name, description: text },
      },
    ]
  }
  if (target === 'educations' && itemId) {
    const edu = snapshot.educations.find((e) => e.id === itemId)
    if (!edu) return null
    return [
      {
        actionId: newActionId(),
        actionType: 'edit_education',
        riskLevel: RISK_MATRIX.edit_education,
        targetField: sectionTargetField('educations', itemId),
        summary: `Edit education ${edu.school}`,
        payload: { itemId, school: edu.school, degree: edu.degree ?? null, description: text },
      },
    ]
  }
  return null
}
