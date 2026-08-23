import { appendAuditEvent } from '../../audit/audit.service.js'
import { ApiError } from '../../errors/apiError.js'
import { profileUpdateSchema, type ProfileUpdateInput } from './profile.schema.js'
import {
  createForOwner,
  docToSnapshot,
  findOneByOwner,
  readSnapshotByOwner,
  updateSectionsByOwner,
} from './profile.repository.js'
import {
  EMPTY_PROFILE_SNAPSHOT,
  type ProfileDTO,
  type ProfileSectionName,
  type ProfileSnapshot,
} from './profile.types.js'
import { appendProfileVersion, diffSnapshots } from '../versions/version.service.js'
import type { ProfileDocument } from './profile.model.js'

export interface ProfileUpdateResult {
  profile: ProfileDTO
  versionNumber: number
  changes: ReturnType<typeof diffSnapshots>
}

function toProfileDTO(doc: ProfileDocument): ProfileDTO {
  const json = doc.toJSON() as unknown as Record<string, unknown>
  return {
    userId: String(json.userId),
    headline: doc.headline ?? '',
    about: doc.about ?? '',
    experiences: docToSnapshot(doc).experiences,
    educations: docToSnapshot(doc).educations,
    projects: docToSnapshot(doc).projects,
    skills: docToSnapshot(doc).skills,
    certifications: docToSnapshot(doc).certifications,
    featured: docToSnapshot(doc).featured,
    createdAt: new Date((json.createdAt as Date) ?? new Date()).toISOString(),
    updatedAt: new Date((json.updatedAt as Date) ?? new Date()).toISOString(),
  }
}

export async function getOrCreateProfile(userId: string): Promise<ProfileDTO> {
  const existing = await findOneByOwner(userId)
  if (existing) return toProfileDTO(existing)

  await createForOwner(userId, EMPTY_PROFILE_SNAPSHOT)
  await appendProfileVersion(userId, EMPTY_PROFILE_SNAPSHOT, {
    source: 'original',
    label: 'v1 original — initial empty profile',
  })
  const created = await findOneByOwner(userId)
  if (!created) throw new ApiError(500, 'INTERNAL_ERROR', 'profile creation failed')
  return toProfileDTO(created)
}

export async function getProfileSnapshotOrEmpty(userId: string): Promise<ProfileSnapshot> {
  const existing = await readSnapshotByOwner(userId)
  if (existing) return existing
  const created = await getOrCreateProfile(userId)
  return snapshotFromDTO(created)
}

export function snapshotFromDTO(profile: ProfileDTO): ProfileSnapshot {
  return {
    headline: profile.headline,
    about: profile.about,
    experiences: profile.experiences,
    educations: profile.educations,
    projects: profile.projects,
    skills: profile.skills,
    certifications: profile.certifications,
    featured: profile.featured,
  }
}

export async function updateProfile(
  userId: string,
  input: unknown,
  meta: { source: 'user_edit' | 'ai_proposal' | 'execution'; label: string; proposalId?: string },
): Promise<ProfileUpdateResult> {
  const patch = profileUpdateSchema.parse(input) satisfies ProfileUpdateInput

  await getOrCreateProfile(userId)
  const current = await getProfileSnapshotOrEmpty(userId)
  const next: ProfileSnapshot = {
    ...current,
    ...(patch as Partial<ProfileSnapshot>),
  }

  const updated = await updateSectionsByOwner(userId, { $set: { ...patch } })
  if (!updated) throw new ApiError(500, 'INTERNAL_ERROR', 'profile update failed')

  const version = await appendProfileVersion(userId, next, meta)

  await appendAuditEvent({
    userId,
    actionType: 'profile.updated',
    entityType: 'profile',
    entityId: userId,
    before: current,
    after: next,
  })

  const fresh = await findOneByOwner(userId)
  return {
    profile: toProfileDTO(fresh!),
    versionNumber: version.versionNumber,
    changes: diffSnapshots(current, next),
  }
}

export function sectionTextOf(snapshot: ProfileSnapshot, target: ProfileSectionName): string {
  switch (target) {
    case 'headline':
      return snapshot.headline ?? ''
    case 'about':
      return snapshot.about ?? ''
    case 'experiences':
      return (snapshot.experiences ?? [])
        .map((e) => `${e.role} at ${e.company}: ${e.description ?? ''}`)
        .join('\n')
    case 'educations':
      return (snapshot.educations ?? []).map((e) => `${e.degree ?? ''} ${e.school}`).join('\n')
    case 'projects':
      return (snapshot.projects ?? [])
        .map((p) => `${p.name}: ${p.description ?? ''}`)
        .join('\n')
    case 'skills':
      return (snapshot.skills ?? []).map((s) => s.name).join(', ')
    case 'certifications':
      return (snapshot.certifications ?? []).map((c) => c.name).join(', ')
    case 'featured':
      return (snapshot.featured ?? []).map((f) => f.title).join(', ')
  }
}
