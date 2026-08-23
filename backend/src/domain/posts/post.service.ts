import { z } from 'zod'
import { Types } from 'mongoose'
import { ApiError } from '../../errors/apiError.js'
import { appendAuditEvent } from '../../audit/audit.service.js'
import { assertPostTransition, type PostState } from '../../state-machine/states.js'
import { findManyByOwner, insertForOwner, requireOneByOwner } from './post.repository.js'
import type { PostDocument } from './post.model.js'
import { validateTextAgainstFacts } from '../fact-validation/factValidation.service.js'
import { contentHash } from '../../security/contentHash.js'
import { createPostPublishProposal } from '../proposal/proposal.service.js'
import { ApprovalRequestModel } from '../approval/approval.model.js'

export const postCreateSchema = z
  .object({
    title: z.string().trim().max(300).optional(),
    text: z.string().trim().min(1).max(3000),
  })
  .strict()

export const postUpdateSchema = z
  .object({ text: z.string().trim().min(1).max(3000) })
  .strict()

export interface PostDTO {
  id: string
  userId: string
  title?: string | null
  text: string
  finalText?: string | null
  state: PostState
  versionTag: number
  factValidation: unknown
  publishProposalId: string | null
  publishedAt?: string | null
  verificationResult?: string | null
  createdAt: string
}

function toDTO(doc: Awaited<ReturnType<typeof insertForOwner>>): PostDTO {
  return doc.toJSON() as unknown as PostDTO
}

export async function createDraftByOwner(
  userId: string,
  input: unknown,
): Promise<PostDocument> {
  const parsed = postCreateSchema.parse(input)
  const created = await insertForOwner({ userId, text: parsed.text, title: parsed.title ?? null })
  await appendAuditEvent({
    userId,
    actionType: 'post.created',
    entityType: 'post',
    entityId: created.id,
    before: null,
    after: toDTO(created),
  })
  return created
}

export async function listPostsByOwner(userId: string) {
  const docs = await findManyByOwner(userId)
  return docs.map(toDTO)
}

export async function getPostByOwner(userId: string, postId: string) {
  return requireOneByOwner(userId, postId)
}

/** USER EDIT creates a new version tag — never overwrites history silently (flow.md §39). */
export async function updateDraftByOwner(
  userId: string,
  postId: string,
  input: unknown,
): Promise<PostDocument> {
  const parsed = postUpdateSchema.parse(input)
  const doc = await requireOneByOwner(userId, postId)
  if (['published'].includes(doc.state)) {
    throw ApiError.conflict('EXECUTION_ERROR', 'published posts cannot be edited')
  }
  if (!['draft', 'ai_review', 'blocked_fact_check', 'final_draft', 'waiting_approval', 'user_editing'].includes(doc.state)) {
    throw ApiError.conflict('EXECUTION_ERROR', `post in state "${doc.state}" cannot be edited`)
  }

  let state: PostState = doc.state
  if (state !== 'draft') {
    assertPostTransition(state as PostState, 'user_editing')
    state = 'user_editing'
    assertPostTransition('user_editing', 'draft')
    state = 'draft'
  }
  doc.state = state
  doc.text = parsed.text
  doc.finalText = null
  doc.versionTag += 1
  doc.contentHash = null
  doc.factValidation = null
  await doc.save()
  await appendAuditEvent({
    userId,
    actionType: 'post.updated',
    entityType: 'post',
    entityId: postId,
    before: null,
    after: toDTO(doc),
  })
  return doc
}

/** AI REVIEW step (flow.md §36): fact validation gates the FINAL DRAFT. */
export async function reviewDraftByOwner(userId: string, postId: string): Promise<PostDocument> {
  const doc = await requireOneByOwner(userId, postId)
  assertPostTransition(doc.state as PostState, 'ai_review')
  doc.state = 'ai_review'
  await doc.save()

  const validation = await validateTextAgainstFacts(userId, doc.text)
  doc.factValidation = validation as never
  if (validation.isReady) {
    assertPostTransition('ai_review', 'final_draft')
    doc.state = 'final_draft'
    doc.finalText = doc.text
    doc.contentHash = contentHash({ postId: doc.id, text: doc.text, versionTag: doc.versionTag })
  } else {
    assertPostTransition('ai_review', 'blocked_fact_check')
    doc.state = 'blocked_fact_check'
  }
  await doc.save()
  await appendAuditEvent({
    userId,
    actionType: 'post.updated',
    entityType: 'post',
    entityId: postId,
    before: { state: 'ai_review' },
    after: { state: doc.state, unsupported: validation.unsupportedCount },
  })
  return doc
}

/**
 * Publish REQUEST creates the CRITICAL-risk proposal bound to the exact final draft
 * (versionId + contentHash). Nothing is public yet.
 */
export async function requestPublishByOwner(userId: string, postId: string): Promise<PostDocument> {
  const doc = await requireOneByOwner(userId, postId)
  if (doc.state !== 'final_draft') {
    throw ApiError.conflict(
      'EXECUTION_ERROR',
      'only a validated final draft can be queued for publishing — run the fact check first',
    )
  }
  const proposal = await createPostPublishProposal({
    userId,
    postId: doc.id,
    postVersionTag: doc.versionTag,
    finalText: doc.finalText ?? doc.text,
    draftBefore: doc.text,
  })
  assertPostTransition(doc.state as PostState, 'waiting_approval')
  doc.state = 'waiting_approval'
  doc.publishProposalId = proposal.id
  await doc.save()
  await appendAuditEvent({
    userId,
    actionType: 'post.publish_requested',
    entityType: 'post',
    entityId: doc.id,
    before: null,
    after: { proposalId: proposal.id, contentHash: doc.contentHash },
  })
  return doc
}

/** Explicit publish CONFIRMATION right before execution (flow.md §36/§46). */
export async function confirmPublishByOwner(userId: string, postId: string): Promise<PostDocument> {
  const doc = await requireOneByOwner(userId, postId)
  if (doc.state !== 'waiting_approval' && doc.state !== 'approved') {
    throw ApiError.conflict('EXECUTION_ERROR', `post in state "${doc.state}" cannot be confirmed for publishing`)
  }
  if (!doc.publishProposalId) {
    throw ApiError.conflict('EXECUTION_ERROR', 'no publish proposal is linked to this post')
  }
  const approval = await ApprovalRequestModel.findOne({
    proposalId: doc.publishProposalId,
    userId: new Types.ObjectId(userId),
    status: 'approved',
  }).exec()
  if (!approval) {
    throw ApiError.approvalRequired('approve the publish proposal before confirming publication')
  }
  const fromState = doc.state
  if (fromState === 'waiting_approval') assertPostTransition('waiting_approval', 'approved')
  assertPostTransition('approved', 'publish_confirmed')
  doc.state = 'publish_confirmed'
  await doc.save()
  await appendAuditEvent({
    userId,
    actionType: 'post.publish_confirmed',
    entityType: 'post',
    entityId: doc.id,
    before: { state: fromState },
    after: { state: 'publish_confirmed', approvalId: String(approval._id) },
  })
  return doc
}

/** Executor side-effect hook — reflects honest outcomes back into the post lifecycle. */
export async function applyPostExecutionState(
  userId: string,
  postId: string,
  actionType: string,
  status: string,
): Promise<void> {
  const doc = await findOneByOwnerSafe(userId, postId)
  if (!doc || actionType !== 'publish_post') return

  if (status === 'completed') {
    try {
      assertPostTransition(doc.state as PostState, 'publishing')
      doc.state = 'publishing'
      await doc.save()
      assertPostTransition('publishing', 'published')
      doc.state = 'published'
      doc.publishedAt = new Date()
      doc.verificationResult = 'published'
      await doc.save()
    } catch {
      // transition guard refused — leave persisted state untouched
    }
    return
  }
  if (status === 'unverified') {
    try {
      if (doc.state === 'publish_confirmed') {
        assertPostTransition('publish_confirmed', 'publishing')
        doc.state = 'publishing'
        await doc.save()
        assertPostTransition('publishing', 'unverified')
      } else {
        assertPostTransition(doc.state as PostState, 'unverified')
      }
      doc.state = 'unverified'
      doc.verificationResult = 'unverified'
      await doc.save()
    } catch {
      // transition guard refused — leave persisted state untouched
    }
  }
}

async function findOneByOwnerSafe(userId: string, postId: string) {
  try {
    return await requireOneByOwner(userId, postId)
  } catch {
    return null
  }
}
