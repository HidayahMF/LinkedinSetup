import { appendAuditEvent } from '../audit/audit.service.js'
import { ReviewModel, type ReviewDocument } from '../domain/review/review.model.js'
import { validateTextAgainstFacts } from '../domain/fact-validation/factValidation.service.js'
import {
  getProfileSnapshotOrEmpty,
  sectionTextOf,
} from '../domain/profile/profile.service.js'
import type { ProfileSectionName } from '../domain/profile/profile.types.js'

export interface SectionScore {
  section: string
  score: number
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function lengthScore(text: string, min: number, good: number): number {
  const len = text.trim().length
  if (len === 0) return 0
  if (len >= good) return 100
  return clamp((len / good) * 80 + (len >= min ? 10 : 0))
}

/**
 * Reviewer (flow.md §26/§27/§28): read-only analysis. Output is an AI evaluation —
 * never treated as objective fact.
 */
export async function runProfileReview(
  userId: string,
  target: 'profile' | ProfileSectionName,
): Promise<ReviewDocument> {
  const snapshot = await getProfileSnapshotOrEmpty(userId)

  const strengths: string[] = []
  const issues: string[] = []
  const missingInformation: string[] = []
  const recommendations: string[] = []
  const optionalImprovements: string[] = []

  const targets: ProfileSectionName[] =
    target === 'profile'
      ? ['headline', 'about', 'experiences', 'educations', 'projects', 'skills', 'certifications', 'featured']
      : [target]

  const scores: Record<string, number> = {}
  let unsupportedAll: string[] = []

  for (const section of targets) {
    const text = sectionTextOf(snapshot, section)
    const validation = await validateTextAgainstFacts(userId, text || '')
    unsupportedAll = unsupportedAll.concat(
      validation.claims.filter((c) => c.status !== 'supported').map((c) => `${section}: ${c.claim} (${c.reason})`),
    )

    switch (section) {
      case 'headline':
        scores['Headline'] = lengthScore(text, 30, 120)
        break
      case 'about':
        scores['About'] = lengthScore(text, 200, 800)
        break
      case 'experiences':
        scores['Experience'] = snapshot.experiences.length
          ? clamp(
              40 +
                (snapshot.experiences.filter((e) => (e.description ?? '').trim()).length /
                  snapshot.experiences.length) *
                  60,
            )
          : 0
        break
      case 'educations':
        scores['Education'] = snapshot.educations.length ? 100 : 0
        break
      case 'projects':
        scores['Projects'] = snapshot.projects.length
          ? clamp(
              40 +
                (snapshot.projects.filter((p) => (p.description ?? '').trim()).length /
                  snapshot.projects.length) *
                  60,
            )
          : 0
        break
      case 'skills':
        scores['Skills'] = clamp(Math.min(100, snapshot.skills.length * 12))
        break
      case 'certifications':
        scores['Certifications'] = snapshot.certifications.length ? 100 : 50
        break
      case 'featured':
        scores['Featured'] = snapshot.featured.length ? 100 : 50
        break
    }

    if (!text.trim()) missingInformation.push(section)
    else strengths.push(`${section}: present`)
    if (validation.needsConfirmationCount > 0) {
      issues.push(
        `${section}: ${validation.needsConfirmationCount} statement(s) need your explicit confirmation`,
      )
    }
    if (validation.unsupportedCount > 0) {
      issues.push(`${section}: ${validation.unsupportedCount} statement(s) have NO verified source`)
    }
  }

  for (const [section, score] of Object.entries(scores)) {
    if (score < 60) recommendations.push(`Strengthen "${section}" (score ${score}/100).`)
    else optionalImprovements.push(`Polish "${section}" further when you have new verified facts.`)
  }
  if (!snapshot.headline.trim()) {
    recommendations.push('Run "improve headline" after adding a basic factual headline.')
  }
  if (unsupportedAll.length > 0) {
    recommendations.push('Fix unsupported claims before publishing anything — I cannot verify them.')
  }

  const overallValues = Object.values(scores)
  const overall = overallValues.length
    ? clamp(overallValues.reduce((a, b) => a + b, 0) / overallValues.length)
    : 0

  const created = await ReviewModel.create({
    userId,
    target,
    strengths,
    issues,
    unsupportedClaims: unsupportedAll,
    missingInformation,
    recommendations,
    optionalImprovements,
    scores,
    overall,
  })

  await appendAuditEvent({
    userId,
    actionType: 'review.generated',
    entityType: 'ai_review',
    entityId: created.id,
    before: null,
    after: { target, overall },
  })
  return created
}
