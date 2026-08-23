import { Types } from 'mongoose'
import { ApiError } from '../../errors/apiError.js'
import { appendAuditEvent } from '../../audit/audit.service.js'
import {
  ApprovalRequestModel,
  type ApprovalRequestDocument,
  type ApprovalStatus,
  type RiskLevel,
} from './approval.model.js'

export interface ApprovalRequestDTO {
  id: string
  userId: string
  proposalId: string
  versionId: string
  contentHash: string
  summary: string
  changes: unknown[]
  riskLevel: RiskLevel
  status: ApprovalStatus
  plannedActionIds: string[]
  approvedActionIds: string[]
  rejectedActionIds: string[]
  expiresAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
  cancellationReason?: string | null
  createdAt: string
}

export function toApprovalDTO(doc: ApprovalRequestDocument): ApprovalRequestDTO {
  return doc.toJSON() as unknown as ApprovalRequestDTO
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export async function createApprovalRecord(input: {
  userId: string
  proposalId: string
  versionId: string
  contentHash: string
  summary: string
  changes: unknown[]
  riskLevel: RiskLevel
  plannedActionIds: string[]
  plannedActions: unknown[]
  ttlMs?: number
}): Promise<ApprovalRequestDocument> {
  if (!input.contentHash || !input.versionId) {
    // flow.md §45.1 — approvals must be bound to content; missing binding is invalid
    throw ApiError.validation('approval requires contentHash and versionId binding')
  }
  const created = await ApprovalRequestModel.create({
    userId: new Types.ObjectId(input.userId),
    proposalId: input.proposalId,
    versionId: input.versionId,
    contentHash: input.contentHash,
    summary: input.summary,
    changes: input.changes,
    riskLevel: input.riskLevel,
    plannedActionIds: input.plannedActionIds,
    plannedActions: input.plannedActions,
    approvedActionIds: [],
    rejectedActionIds: [],
    expiresAt: new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS)),
    status: 'pending',
  })
  await appendAuditEvent({
    userId: input.userId,
    actionType: 'approval.created',
    entityType: 'approval_request',
    entityId: String(created._id),
    before: null,
    after: toApprovalDTO(created),
  })
  return created
}

export function isExpired(doc: ApprovalRequestDocument, now = new Date()): boolean {
  if (!doc.expiresAt) return true
  return doc.expiresAt.getTime() <= now.getTime()
}

export async function getApprovalByOwner(
  userId: string,
  approvalRequestId: string,
): Promise<ApprovalRequestDocument> {
  let doc: ApprovalRequestDocument | null = null
  try {
    doc = await ApprovalRequestModel.findOne({
      _id: approvalRequestId,
      userId: new Types.ObjectId(userId),
    }).exec()
  } catch {
    doc = null
  }
  if (!doc) throw ApiError.notFound('Approval request not found')
  return doc
}

export async function findValidApprovalForProposal(
  userId: string,
  proposalId: string,
): Promise<ApprovalRequestDocument | null> {
  const doc = await ApprovalRequestModel.findOne({
    proposalId,
    userId: new Types.ObjectId(userId),
    status: 'approved',
  })
    .sort({ createdAt: -1 })
    .exec()
  if (!doc) return null
  if (isExpired(doc)) return null
  return doc
}

export async function recordApprovalDecision(input: {
  userId: string
  approvalRequestId: string
  decision: 'approved' | 'rejected'
  approvedActionIds?: string[]
  rejectedActionIds?: string[]
}): Promise<ApprovalRequestDocument> {
  const doc = await getApprovalByOwner(input.userId, input.approvalRequestId)
  if (doc.status !== 'pending') {
    throw ApiError.conflict('EXECUTION_ERROR', `approval is already ${doc.status}`)
  }
  if (isExpired(doc)) {
    doc.status = 'cancelled'
    doc.cancellationReason = 'expired before decision'
    await doc.save()
    throw ApiError.gone('approval request expired — a new approval is required')
  }

  const planned = new Set(doc.plannedActionIds)
  const approved = (input.approvedActionIds ?? [...doc.plannedActionIds]).filter((id) =>
    planned.has(id),
  )
  const rejectedInput = input.rejectedActionIds ?? []
  const rejected = rejectedInput.filter(
    (id) => planned.has(id) && !approved.includes(id),
  )

  doc.status = input.decision
  doc.approvedActionIds = input.decision === 'approved' ? approved : []
  doc.rejectedActionIds = [
    ...new Set([...rejected, ...(input.decision === 'rejected' ? [...planned] : [])]),
  ]
  if (input.decision === 'approved') doc.approvedAt = new Date()
  if (input.decision === 'rejected') doc.rejectedAt = new Date()

  await doc.save()
  await appendAuditEvent({
    userId: input.userId,
    actionType: input.decision === 'approved' ? 'proposal.approved' : 'proposal.rejected',
    entityType: 'approval_request',
    entityId: String(doc._id),
    before: { status: 'pending' },
    after: toApprovalDTO(doc),
  })
  return doc
}

/** Invalidates an existing approval because the underlying content changed (flow.md §45).
 * Both pending AND already-approved records become invalid — stale approval must never
 * authorize modified content.
 */
export async function cancelApprovalsForProposal(
  userId: string,
  proposalId: string,
  reason: string,
): Promise<number> {
  const docs = await ApprovalRequestModel.find({
    proposalId,
    userId: new Types.ObjectId(userId),
    status: { $in: ['pending', 'approved'] },
  }).exec()
  for (const doc of docs) {
    doc.status = 'cancelled'
    doc.cancellationReason = reason
    await doc.save()
    await appendAuditEvent({
      userId,
      actionType: 'approval.created',
      entityType: 'approval_request',
      entityId: String(doc._id),
      before: { status: 'pending' },
      after: toApprovalDTO(doc),
    })
  }
  return docs.length
}

export async function listApprovalsByOwner(
  userId: string,
  filter: { status?: ApprovalStatus } = {},
): Promise<ApprovalRequestDTO[]> {
  const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) }
  if (filter.status) query.status = filter.status
  const docs = await ApprovalRequestModel.find(query).sort({ createdAt: -1 }).limit(100).exec()
  return docs.map(toApprovalDTO)
}
