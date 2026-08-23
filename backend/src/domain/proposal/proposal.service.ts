import { randomBytes } from 'node:crypto'
import { Types } from 'mongoose'
import { ApiError } from '../../errors/apiError.js'
import { appendAuditEvent } from '../../audit/audit.service.js'
import { assertProposalTransition, type ProposalState } from '../../state-machine/states.js'
import {
  createApprovalRecord,
  recordApprovalDecision,
  cancelApprovalsForProposal,
  toApprovalDTO,
} from '../approval/approval.service.js'
import type { ApprovalRequestDocument } from '../approval/approval.model.js'
import { materializeApprovedActions, computeExecutableContentHash } from '../../execution/actionPlanner.js'
import type { PlannedActionDraft } from '../../execution/actionTypes.js'
import { ProposalModel, type ProposalDocument, type ProposalTargetType } from './proposal.model.js'
import { validateTextAgainstFacts } from '../fact-validation/factValidation.service.js'
import {
  improveSection,
  repackPlannedActionPayload,
} from '../../agent/improver.js'
import {
  getProfileSnapshotOrEmpty,
  getOrCreateProfile,
} from '../profile/profile.service.js'
import { appendProfileVersion } from '../versions/version.service.js'
import { updateSectionsByOwner } from '../profile/profile.repository.js'
import type { ProfileSectionName } from '../profile/profile.types.js'

const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000

export interface ProposalDTO {
  id: string
  userId: string
  title: string
  targetType: ProposalTargetType
  targetField: string
  itemId?: string | null
  postId?: string | null
  state: ProposalState
  changes: unknown[]
  plannedActions: PlannedActionDraft[]
  factValidation: unknown
  versionId: string
  proposalVersion: number
  contentHash: string
  expiresAt: string
  approvalRequestId?: string | null
  questions: string[]
  createdBy: string
  createdAt: string
}

export function toProposalDTO(doc: ProposalDocument): ProposalDTO {
  return doc.toJSON() as unknown as ProposalDTO
}

function buildFactSummary(validation: Awaited<ReturnType<typeof validateTextAgainstFacts>>) {
  return {
    claims: validation.claims,
    supportedCount: validation.supportedCount,
    unsupportedCount: validation.unsupportedCount,
    needsConfirmationCount: validation.needsConfirmationCount,
    isReady: validation.isReady,
  }
}

async function validateProposalText(
  userId: string,
  text: string,
): Promise<Awaited<ReturnType<typeof validateTextAgainstFacts>>> {
  return validateTextAgainstFacts(userId, text)
}

export async function createImprovementProposal(
  userId: string,
  input: { target: ProfileSectionName; itemId?: string | null; instructions?: string },
): Promise<ProposalDocument> {
  await getOrCreateProfile(userId)
  const snapshot = await getProfileSnapshotOrEmpty(userId)

  const improvement = await improveSection(userId, snapshot, input.target, input.itemId)
  if (improvement.status === 'needs_user_input') {
    // flow.md §22/§23 — ask instead of guessing; no proposal without verified content
    throw ApiError.missingInformation(improvement.questions.join(' '))
  }

  const baseVersionModel = await import('../versions/version.model.js')
  const latestVersion = await baseVersionModel.ProfileVersionModel.findOne({ userId })
    .sort({ versionNumber: -1 })
    .exec()
  if (!latestVersion) throw ApiError.notFound('No profile version found — save the profile first')
  const versionId = String(latestVersion._id)

  const validation = await validateProposalText(userId, improvement.after)
  const summary = buildFactSummary(validation)

  const created = await ProposalModel.create({
    userId,
    title: improvement.title,
    targetType: 'profile',
    targetField: improvement.targetField,
    itemId: improvement.itemId ?? null,
    postId: null,
    state: 'proposed',
    changes: improvement.changes,
    plannedActions: improvement.plannedActions,
    factValidation: summary,
    versionId,
    proposalVersion: 1,
    contentHash: computeExecutableContentHash(versionId, improvement.plannedActions),
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    questions: [],
    createdBy: 'ai',
  })

  if (summary.isReady) {
    assertProposalTransition('proposed', 'fact_validated')
    assertProposalTransition('fact_validated', 'waiting_for_approval')
    created.state = 'waiting_for_approval'
  }
  await created.save()

  await appendAuditEvent({
    userId,
    actionType: 'proposal.created',
    entityType: 'ai_proposal',
    entityId: created.id,
    before: null,
    after: toProposalDTO(created),
  })
  return created
}

/** Creates a publish proposal for a post's final draft — CRITICAL risk, requires explicit confirmation. */
export async function createPostPublishProposal(input: {
  userId: string
  postId: string
  postVersionTag: number
  finalText: string
  draftBefore: string
}): Promise<ProposalDocument> {
  const versionId = `post:${input.postId}:v${input.postVersionTag}`
  const validation = await validateTextAgainstFacts(input.userId, input.finalText)
  if (!validation.isReady) {
    throw ApiError.conflict(
      'FACT_CONFLICT',
      'the final draft still contains unverified or unconfirmed claims and cannot be queued for publishing',
    )
  }

  const plannedActions: PlannedActionDraft[] = [
    {
      actionId: `act_${randomBytes(8).toString('hex')}`,
      actionType: 'publish_post',
      riskLevel: 'critical',
      targetField: 'post',
      summary: 'Publish post publicly on LinkedIn',
      payload: { postId: input.postId, text: input.finalText },
    },
  ]

  const created = await ProposalModel.create({
    userId: new Types.ObjectId(input.userId),
    title: 'Publish post (public action)',
    targetType: 'post',
    targetField: 'post',
    itemId: null,
    postId: input.postId,
    state: 'proposed',
    changes: [
      {
        field: 'post',
        before: input.draftBefore,
        after: input.finalText,
        reason: 'User requested publishing of the validated final draft',
        supportedFacts: [],
        unsupportedClaims: [],
      },
    ],
    plannedActions,
    factValidation: {
      claims: validation.claims,
      supportedCount: validation.supportedCount,
      unsupportedCount: 0,
      needsConfirmationCount: 0,
      isReady: true,
    },
    versionId,
    proposalVersion: 1,
    contentHash: computeExecutableContentHash(versionId, plannedActions),
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    questions: [],
    createdBy: 'user',
  })
  created.state = 'waiting_for_approval'
  await created.save()
  await appendAuditEvent({
    userId: input.userId,
    actionType: 'proposal.created',
    entityType: 'ai_proposal',
    entityId: created.id,
    before: null,
    after: toProposalDTO(created),
  })
  return created
}

/**
 * USER EDIT creates a NEW proposal version (flow.md §40.1):
 * - recomputes payloads + hash from the edited text
 * - re-runs schema + fact validation
 * - invalidates any previous approval (§45)
 * - cancels approved-but-not-executed actions bound to the old approval
 */
export async function editProposalByOwner(
  userId: string,
  proposalId: string,
  edits: Array<{ field: string; after: string }>,
): Promise<ProposalDocument> {
  const doc = await getProposalByOwner(userId, proposalId)
  if (!['proposed', 'needs_user_input', 'waiting_for_approval', 'content_changed', 'approved', 'ready_to_execute', 'failed'].includes(doc.state)) {
    throw ApiError.conflict('EXECUTION_ERROR', `proposal in state "${doc.state}" cannot be edited`)
  }

  const snapshot = await getProfileSnapshotOrEmpty(userId)
  let changed = false
  for (const edit of edits) {
    const change = doc.changes.find((c) => c.field === edit.field)
    if (!change) continue
    change.after = edit.after
    changed = true
  }
  if (!changed) throw ApiError.validation('no matching fields to edit')

  const target = (doc.targetField.split(':')[0] ?? doc.targetField) as ProfileSectionName
  const primaryChange = doc.changes[0]
  const editedText = String(primaryChange?.after ?? '').trim()

  let plannedActions: PlannedActionDraft[] | null
  if (doc.targetType === 'post') {
    plannedActions = (doc.plannedActions as unknown as PlannedActionDraft[]).map((a) => ({
      ...a,
      payload: { ...a.payload, text: editedText },
    }))
  } else {
    plannedActions = repackPlannedActionPayload(target, doc.itemId, editedText, snapshot)
  }
  if (!plannedActions || !editedText) {
    throw ApiError.missingInformation('edited content is empty — provide actual content instead')
  }

  // invalidate previous approvals + cancel not-yet-executed actions (flow.md §45)
  await cancelApprovalsForProposal(userId, doc.id, 'CONTENT_CHANGED: proposal edited by user')
  const { LinkedInActionModel } = await import('../../execution/actions/action.model.js')
  await LinkedInActionModel.updateMany(
    { proposalId: doc.id, status: 'approved' },
    { $set: { status: 'cancelled' } },
  ).exec()

  const validation = await validateTextAgainstFacts(userId, editedText)

  assertProposalTransition(doc.state as ProposalState, 'content_changed')
  doc.state = 'content_changed'
  doc.proposalVersion += 1
  doc.plannedActions = plannedActions.map((a) => ({ ...a })) as never
  doc.contentHash = computeExecutableContentHash(doc.versionId, plannedActions)
  doc.factValidation = {
    claims: validation.claims,
    supportedCount: validation.supportedCount,
    unsupportedCount: validation.unsupportedCount,
    needsConfirmationCount: validation.needsConfirmationCount,
    isReady: validation.isReady,
  } as never
  doc.approvalRequestId = null
  await doc.save()

  if (validation.isReady) {
    assertProposalTransition('content_changed', 'fact_validated')
    assertProposalTransition('fact_validated', 'waiting_for_approval')
    doc.state = 'waiting_for_approval'
  } else {
    assertProposalTransition('content_changed', 'proposed')
    doc.state = 'proposed'
  }
  await doc.save()

  await appendAuditEvent({
    userId,
    actionType: 'proposal.edited',
    entityType: 'ai_proposal',
    entityId: doc.id,
    before: null,
    after: toProposalDTO(doc),
  })
  return doc
}

export async function approveProposalByOwner(
  userId: string,
  proposalId: string,
  scope: { approvedActionIds?: string[]; rejectedActionIds?: string[] } = {},
): Promise<{ approval: ApprovalRequestDocument; queueCounts: { approved: number; rejected: number }; proposal: ProposalDocument }> {
  const doc = await getProposalByOwner(userId, proposalId)

  if (doc.expiresAt.getTime() <= Date.now()) {
    throw ApiError.gone('proposal expired — request a fresh one before approving')
  }
  if (!['waiting_for_approval'].includes(doc.state)) {
    throw ApiError.conflict(
      'EXECUTION_ERROR',
      `proposal in state "${doc.state}" cannot be approved — resolve fact validation first`,
    )
  }
  const fv = doc.factValidation as { isReady?: boolean }
  if (fv?.isReady !== true) {
    throw ApiError.conflict(
      'EXECUTION_ERROR',
      'proposal is not READY: unresolved unsupported/unconfirmed statements block approval (T-09)',
    )
  }

  assertProposalTransition(doc.state as ProposalState, 'approved')

  const approval = await createApprovalRecord({
    userId,
    proposalId: doc.id,
    versionId: doc.versionId,
    contentHash: doc.contentHash,
    summary: doc.title,
    changes: doc.changes.map((c) => ({
      field: c.field,
      before: c.before,
      after: c.after,
      reason: c.reason,
    })),
    riskLevel: maxRiskOf(doc.plannedActions as unknown as PlannedActionDraft[]),
    plannedActionIds: (doc.plannedActions as unknown as PlannedActionDraft[]).map(
      (a) => a.actionId,
    ),
    plannedActions: (doc.plannedActions as unknown as PlannedActionDraft[]).map((a) => ({ ...a })),
  })

  const decision = await recordApprovalDecision({
    userId,
    approvalRequestId: String(approval._id),
    decision: 'approved',
    approvedActionIds: scope.approvedActionIds,
    rejectedActionIds: scope.rejectedActionIds,
  })

  const beforeByField = new Map<string, unknown>()
  for (const change of doc.changes) beforeByField.set(change.field, change.before)

  // approval record already stores the immutable plannedActions snapshot
  const materialized = await materializeApprovedActions(
    userId,
    { id: doc.id, versionId: doc.versionId, beforeByField },
    decision as ApprovalRequestDocument & { plannedActions: PlannedActionDraft[] },
  )

  doc.approvalRequestId = String(decision._id)
  doc.state = materialized.approvedCount > 0 ? 'ready_to_execute' : 'approved'
  await doc.save()

  return {
    approval: decision,
    queueCounts: { approved: materialized.approvedCount, rejected: materialized.rejectedCount },
    proposal: doc,
  }
}

function maxRiskOf(actions: PlannedActionDraft[]): 'low' | 'medium' | 'high' | 'critical' {
  const order = ['low', 'medium', 'high', 'critical']
  let max = 0
  for (const action of actions) {
    max = Math.max(max, order.indexOf(action.riskLevel))
  }
  return order[max] as 'low' | 'medium' | 'high' | 'critical'
}

export async function rejectProposalByOwner(
  userId: string,
  proposalId: string,
): Promise<ProposalDocument> {
  const doc = await getProposalByOwner(userId, proposalId)
  if (['rejected', 'cancelled'].includes(doc.state)) return doc
  assertProposalTransition(doc.state as ProposalState, 'rejected')
  doc.state = 'rejected'
  await doc.save()

  await cancelApprovalsForProposal(userId, doc.id, 'proposal rejected by user')
  const { LinkedInActionModel } = await import('../../execution/actions/action.model.js')
  await LinkedInActionModel.updateMany(
    { proposalId: doc.id, status: 'approved' },
    { $set: { status: 'cancelled' } },
  ).exec()

  await appendAuditEvent({
    userId,
    actionType: 'proposal.rejected',
    entityType: 'ai_proposal',
    entityId: doc.id,
    before: null,
    after: toProposalDTO(doc),
  })
  return doc
}

export async function getProposalByOwner(
  userId: string,
  proposalId: string,
): Promise<ProposalDocument> {
  let doc: ProposalDocument | null = null
  try {
    doc = await ProposalModel.findOne({ _id: proposalId, userId }).exec()
  } catch {
    doc = null
  }
  if (!doc) throw ApiError.notFound('Proposal not found')
  return doc
}

export async function listProposalsByOwner(
  userId: string,
  filter: { state?: ProposalState } = {},
): Promise<ProposalDTO[]> {
  const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) }
  if (filter.state) query.state = filter.state
  const docs = await ProposalModel.find(query).sort({ createdAt: -1 }).limit(100).exec()
  return docs.map(toProposalDTO)
}

export { toApprovalDTO }

/** Applies an approved profile proposal after successful execution — appends an execution version. */
export async function applyExecutedProfileAction(
  userId: string,
  proposalId: string,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const doc = await ProposalModel.findOne({ _id: proposalId, userId }).exec()
  if (!doc || doc.targetType !== 'profile') return

  const patch: Record<string, unknown> = {}
  if (actionType === 'update_headline') patch.headline = payload.headline
  if (actionType === 'update_about') patch.about = payload.about
  if (actionType === 'edit_experience' && typeof payload.itemId === 'string') {
    const snapshot = await getProfileSnapshotOrEmpty(userId)
    patch.experiences = (snapshot.experiences ?? []).map((e) =>
      e.id === payload.itemId ? { ...e, description: payload.description ?? e.description } : e,
    )
  }
  if (actionType === 'edit_project' && typeof payload.itemId === 'string') {
    const snapshot = await getProfileSnapshotOrEmpty(userId)
    patch.projects = (snapshot.projects ?? []).map((p) =>
      p.id === payload.itemId ? { ...p, description: payload.description ?? p.description } : p,
    )
  }
  if (Object.keys(patch).length === 0) return

  await updateSectionsByOwner(userId, { $set: patch })
  const snapshotAfter = await getProfileSnapshotOrEmpty(userId)
  await appendProfileVersion(userId, snapshotAfter, {
    source: 'execution',
    label: `Executed ${actionType} via approved proposal`,
    proposalId: doc.id,
  })
}
