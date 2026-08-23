import { ApiError } from '../../errors/apiError.js'
import { appendAuditEvent } from '../../audit/audit.service.js'
import {
  ProfileVersionModel,
  type ProfileVersionDocument,
  type VersionSource,
} from './version.model.js'
import { readSnapshotByOwner } from '../profile/profile.repository.js'
import type { ProfileSnapshot } from '../profile/profile.types.js'

export interface ProfileVersionDTO {
  id: string
  userId: string
  versionNumber: number
  source: VersionSource
  label: string
  proposalId?: string | null
  snapshot?: ProfileSnapshot
  createdAt: string
}

function toDTO(doc: ProfileVersionDocument, includeSnapshot = false): ProfileVersionDTO {
  const json = doc.toJSON() as unknown as ProfileVersionDTO & {
    snapshot?: ProfileSnapshot | null
  }
  if (!includeSnapshot && json.snapshot !== undefined) {
    delete json.snapshot
  }
  return json
}

export async function appendProfileVersion(
  userId: string,
  snapshot: ProfileSnapshot,
  meta: { source: VersionSource; label: string; proposalId?: string | null },
): Promise<ProfileVersionDTO> {
  const latest = await ProfileVersionModel.findOne({ userId })
    .sort({ versionNumber: -1 })
    .exec()
  const nextNumber = (latest?.versionNumber ?? 0) + 1
  const created = await ProfileVersionModel.create({
    userId,
    versionNumber: nextNumber,
    source: meta.source,
    label: meta.label,
    proposalId: meta.proposalId ?? null,
    snapshot,
  })
  return toDTO(created)
}

export async function listProfileVersions(
  userId: string,
  limit = 100,
): Promise<ProfileVersionDTO[]> {
  const docs = await ProfileVersionModel.find({ userId })
    .sort({ versionNumber: -1 })
    .limit(limit)
    .exec()
  return docs.map((d) => toDTO(d))
}

export async function getProfileVersion(
  userId: string,
  versionId: string,
  includeSnapshot = true,
): Promise<ProfileVersionDTO> {
  const doc = await ProfileVersionModel.findOne({ _id: versionId, userId }).exec()
  if (!doc) throw ApiError.notFound('Profile version not found')
  return toDTO(doc, includeSnapshot)
}

export async function getLatestSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  return readSnapshotByOwner(userId)
}

export interface FieldDiff {
  field: string
  before: unknown
  after: unknown
}

const SNAPSHOT_FIELDS = [
  'headline',
  'about',
  'experiences',
  'educations',
  'projects',
  'skills',
  'certifications',
  'featured',
] as const

export function diffSnapshots(
  before: ProfileSnapshot,
  after: ProfileSnapshot,
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  for (const field of SNAPSHOT_FIELDS) {
    const b = JSON.stringify(before[field] ?? null)
    const a = JSON.stringify(after[field] ?? null)
    if (b !== a) {
      diffs.push({ field, before: before[field], after: after[field] })
    }
  }
  return diffs
}

export async function diffProfileVersions(
  userId: string,
  fromId: string,
  toId: string,
): Promise<{ from: ProfileVersionDTO; to: ProfileVersionDTO; changes: FieldDiff[] }> {
  const [fromDoc, toDoc] = await Promise.all([
    getProfileVersion(userId, fromId, true),
    getProfileVersion(userId, toId, true),
  ])
  return {
    from: fromDoc,
    to: toDoc,
    changes: diffSnapshots(fromDoc.snapshot!, toDoc.snapshot!),
  }
}

export async function restoreProfileVersion(
  userId: string,
  versionId: string,
): Promise<{ restoredFrom: number; newVersion: ProfileVersionDTO; snapshot: ProfileSnapshot }> {
  const source = await getProfileVersion(userId, versionId, true)
  if (!source.snapshot) throw ApiError.notFound('Profile version not found')
  const current = await docToCurrentOrEmpty(userId)
  const changes = diffSnapshots(current, source.snapshot)
  if (changes.length === 0) {
    throw ApiError.conflict('EXECUTION_ERROR', 'version is identical to the current profile state')
  }
  const { updateSectionsByOwner } = await import('../profile/profile.repository.js')
  const updated = await updateSectionsByOwner(userId, { $set: { ...source.snapshot } })
  if (!updated) throw new ApiError(500, 'INTERNAL_ERROR', 'failed to apply restored snapshot')
  const newVersion = await appendProfileVersion(userId, source.snapshot, {
    source: 'restore',
    label: `Restored from v${source.versionNumber}`,
  })
  await appendAuditEvent({
    userId,
    actionType: 'version.restored',
    entityType: 'profile_version',
    entityId: versionId,
    before: current,
    after: source.snapshot,
  })
  return { restoredFrom: source.versionNumber, newVersion, snapshot: source.snapshot }
}

async function docToCurrentOrEmpty(userId: string): Promise<ProfileSnapshot> {
  const existing = await readSnapshotByOwner(userId)
  if (existing) return existing
  return {
    headline: '',
    about: '',
    experiences: [],
    educations: [],
    projects: [],
    skills: [],
    certifications: [],
    featured: [],
  }
}
