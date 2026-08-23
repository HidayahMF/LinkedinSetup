import { appendAuditEvent } from '../audit/audit.service.js'
import { ApiError } from '../errors/apiError.js'
import { contentHash } from '../security/contentHash.js'
import { LinkedInActionModel, type LinkedInActionDocument } from './actions/action.model.js'
import { validateActionPayload, type ActionType } from './actionTypes.js'
import type { ApprovalRequestDocument } from '../domain/approval/approval.model.js'
import type { PlannedActionDraft } from './actionTypes.js'

/**
 * Proposal-level executable content hash (flow.md §45.1).
 * Deterministic canonical JSON over exactly what will be executed — no volatile fields.
 */
export function computeExecutableContentHash(
  versionId: string,
  plannedActions: PlannedActionDraft[],
): string {
  return contentHash({
    versionId,
    actions: plannedActions.map((a) => ({
      actionId: a.actionId,
      actionType: a.actionType,
      targetField: a.targetField,
      payload: a.payload,
    })),
  })
}

export function computeActionContentHash(actionType: ActionType, payload: unknown): string {
  return contentHash({ actionType, payload })
}

export interface MaterializeResult {
  created: LinkedInActionDocument[]
  approvedCount: number
  rejectedCount: number
}

/**
 * Materializes an approved proposal into the executable action queue (flow.md §50).
 * Only actions covered by the approval scope are queued; excluded actions are recorded
 * as rejected and can never execute (T-11 / T-12).
 * Payloads are Zod-validated here — an invalid payload can never become executable (T-19).
 */
export async function materializeApprovedActions(
  userId: string,
  proposal: {
    id: string
    versionId: string
    beforeByField?: Map<string, unknown>
  },
  approval: ApprovalRequestDocument & { plannedActions?: PlannedActionDraft[] },
): Promise<MaterializeResult> {
  const planned = approval.plannedActions ?? []
  if (planned.length === 0) {
    throw ApiError.conflict('EXECUTION_ERROR', 'approval carries no planned actions')
  }

  const approvedIds = new Set(approval.approvedActionIds)
  const rejectedIds = new Set(approval.rejectedActionIds)
  const created: LinkedInActionDocument[] = []
  let order = 0

  for (const item of planned) {
    order += 1
    const isApproved = approvedIds.has(item.actionId)
    const isRejected = rejectedIds.has(item.actionId)
    if (!isApproved && !isRejected) continue

    // T-19: schema validation happens BEFORE queue insertion
    const payload = validateActionPayload(item.actionType as ActionType, item.payload)

    const doc = await LinkedInActionModel.create({
      userId,
      proposalId: proposal.id,
      versionId: proposal.versionId,
      approvalRequestId: String(approval._id),
      plannedActionId: item.actionId,
      actionType: item.actionType as ActionType,
      riskLevel: item.riskLevel,
      targetField: item.targetField,
      summary: item.summary ?? '',
      payload,
      contentHash: computeActionContentHash(item.actionType as ActionType, payload),
      status: isApproved ? 'approved' : 'rejected',
      queueOrder: order,
      before: proposal.beforeByField?.get(item.targetField) ?? null,
    })
    created.push(doc)
    await appendAuditEvent({
      userId,
      actionType: 'action.planned',
      entityType: 'linkedin_action',
      entityId: String(doc._id),
      before: null,
      after: doc.toJSON(),
    })
  }

  return {
    created,
    approvedCount: created.filter((c) => c.status === 'approved').length,
    rejectedCount: created.filter((c) => c.status === 'rejected').length,
  }
}
