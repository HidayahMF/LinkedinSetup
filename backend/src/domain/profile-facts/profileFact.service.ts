import { appendAuditEvent } from '../../audit/audit.service.js'
import { ApiError } from '../../errors/apiError.js'
import {
  createProfileFactSchema,
  type CreateProfileFactInput,
  type ListProfileFactsQuery,
  type UpdateProfileFactInput,
} from './profileFact.schema.js'
import {
  findManyByOwner,
  deleteOneByOwner,
  findOneByOwner,
  insertForOwner,
  updateOneByOwner,
} from './profileFact.repository.js'
import { isAuthoritativeType, type ProfileFactDTO } from './profileFact.types.js'
import type { ProfileFactDocument } from './profileFact.model.js'

function toDTO(doc: ProfileFactDocument): ProfileFactDTO {
  return doc.toJSON() as unknown as ProfileFactDTO
}

function requireAuthoritativeStatus(
  type: CreateProfileFactInput['type'],
  status: CreateProfileFactInput['status'],
): void {
  if (!isAuthoritativeType(type) && status === 'verified') {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `type "${type}" cannot be stored as a verified fact; it must remain ${type} until the user explicitly confirms it`,
    )
  }
}

function assertOwnershipScope(userId: string): string {
  if (!userId) {
    throw new ApiError(401, 'AUTHENTICATION_ERROR', 'Authenticated user context required')
  }
  return userId
}

export async function createProfileFact(
  userId: string,
  input: CreateProfileFactInput,
): Promise<ProfileFactDTO> {
  const ownerId = assertOwnershipScope(userId)
  const parsed = createProfileFactSchema.parse(input)
  requireAuthoritativeStatus(parsed.type, parsed.status)

  const created = await insertForOwner({ ...parsed, userId: ownerId })
  await appendAuditEvent({
    userId: ownerId,
    actionType: 'profile_fact.created',
    entityType: 'profile_fact',
    entityId: String(created._id),
    before: null,
    after: toDTO(created),
  })
  return toDTO(created)
}

export async function listProfileFacts(userId: string, query: ListProfileFactsQuery) {
  const ownerId = assertOwnershipScope(userId)
  const facts = await findManyByOwner(ownerId, query, query.limit)
  return facts.map(toDTO)
}

export async function getProfileFact(userId: string, factId: string): Promise<ProfileFactDTO> {
  const ownerId = assertOwnershipScope(userId)
  const fact = await findOneByOwner(ownerId, factId)
  if (!fact) throw ApiError.notFound('Profile fact not found')
  return toDTO(fact)
}

export async function updateProfileFact(
  userId: string,
  factId: string,
  patch: UpdateProfileFactInput,
): Promise<ProfileFactDTO> {
  const ownerId = assertOwnershipScope(userId)
  const existing = await findOneByOwner(ownerId, factId)
  if (!existing) throw ApiError.notFound('Profile fact not found')

  const beforeJson = toDTO(existing)
  const merged = {
    type: patch.type ?? existing.type,
    category: patch.category ?? existing.category,
    key: patch.key ?? existing.key,
    value: patch.value !== undefined ? patch.value : existing.value,
    status: patch.status ?? existing.status,
    source: patch.source ?? existing.source,
    sourceReference:
      patch.sourceReference !== undefined ? patch.sourceReference : existing.sourceReference,
  }
  const validatedMerged = createProfileFactSchema.parse(merged)
  requireAuthoritativeStatus(validatedMerged.type, validatedMerged.status)

  const updated = await updateOneByOwner(ownerId, factId, { $set: validatedMerged })
  if (!updated) throw ApiError.notFound('Profile fact not found')

  await appendAuditEvent({
    userId: ownerId,
    actionType: 'profile_fact.updated',
    entityType: 'profile_fact',
    entityId: factId,
    before: beforeJson,
    after: toDTO(updated),
  })
  return toDTO(updated)
}

export async function deleteProfileFact(userId: string, factId: string): Promise<void> {
  const ownerId = assertOwnershipScope(userId)
  const existing = await findOneByOwner(ownerId, factId)
  if (!existing) throw ApiError.notFound('Profile fact not found')

  const deleted = await deleteOneByOwner(ownerId, factId)
  if (!deleted) throw ApiError.notFound('Profile fact not found')

  await appendAuditEvent({
    userId: ownerId,
    actionType: 'profile_fact.deleted',
    entityType: 'profile_fact',
    entityId: factId,
    before: toDTO(existing),
    after: null,
  })
}
