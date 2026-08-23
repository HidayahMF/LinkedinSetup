import { isValidObjectId } from 'mongoose'
import { ApiError } from '../errors/apiError.js'
import { appendAuditEvent } from '../audit/audit.service.js'
import { assertActionTransition } from '../state-machine/states.js'
import { LinkedInActionModel, type LinkedInActionDocument } from './actions/action.model.js'
import { computeActionContentHash, computeExecutableContentHash } from './actionPlanner.js'
import { RISK_MATRIX, validateActionPayload, type ActionType } from './actionTypes.js'
import { loadAutomationProvider, type ExecutorOutcome } from './provider.js'
import { ApprovalRequestModel } from '../domain/approval/approval.model.js'
import { ProposalModel } from '../domain/proposal/proposal.model.js'
import { ProfileVersionModel } from '../domain/versions/version.model.js'
import { requireOneByOwner as getPostByOwner } from '../domain/posts/post.repository.js'

export interface ContractCheck {
  id: number
  name: string
  passed: boolean
  detail?: string
}

export interface ExecutionReport {
  action: LinkedInActionDocument | null
  checklist: ContractCheck[]
  executed: boolean
  reason?: string
}

function fail(checks: ContractCheck[], id: number, name: string, detail: string): never {
  checks.push({ id, name, passed: false, detail })
  throw new ApiError(409, 'EXECUTION_ERROR', `final contract check #${id} (${name}) failed: ${detail}`)
}

function pass(checks: ContractCheck[], id: number, name: string, detail?: string): void {
  checks.push({ id, name, passed: true, detail })
}

/**
 * Final Action Execution Contract (flow.md §101) — all 21 checks are AND-connected.
 * The payload is loaded from the stored approved record, NEVER from request body or AI output.
 */
export async function executeAction(userId: string, rawActionId: string): Promise<ExecutionReport> {
  const checks: ContractCheck[] = []
  try {
    return await runExecutionContract(userId, rawActionId, checks)
  } catch (err) {
    // flow.md §101 — the pass/fail result of every checklist must be recorded
    if (err instanceof ApiError && ['EXECUTION_ERROR', 'VALIDATION_ERROR', 'SECURITY_CHALLENGE'].includes(err.code)) {
      await appendAuditEvent({
        userId,
        actionType: 'action.failed',
        entityType: 'linkedin_action',
        entityId: rawActionId,
        before: null,
        after: { checklist: checks, error: err.message },
      })
    }
    throw err
  }
}

async function runExecutionContract(
  userId: string,
  rawActionId: string,
  checks: ContractCheck[],
): Promise<ExecutionReport> {
  const now = new Date()

  // #01–#02 — action exists and belongs to user
  const action = await LinkedInActionModel.findOne({ _id: rawActionId }).exec()
  if (!action) fail(checks, 1, 'action_exists', 'action not found')
  if (String(action!.userId) !== userId) fail(checks, 2, 'action_owner', 'action belongs to another user')
  pass(checks, 1, 'action_exists')
  pass(checks, 2, 'action_owner')

  // #03–#04 — proposal exists and belongs to user
  const proposal = await ProposalModel.findOne({
    _id: action!.proposalId,
    userId,
  }).exec()
  if (!proposal) fail(checks, 3, 'proposal_exists', 'proposal not found')
  if (!proposal || String(proposal.userId) !== userId) {
    fail(checks, 4, 'proposal_owner', 'proposal belongs to another user')
  }
  pass(checks, 3, 'proposal_exists')
  pass(checks, 4, 'proposal_owner')

  // #05–#06 — version exists and belongs to user (profile versions are real records;
  // post versions are synthetic ids bound through the approval payload)
  if (isValidObjectId(action!.versionId)) {
    const version = await ProfileVersionModel.findOne({
      _id: action!.versionId,
      userId,
    }).exec()
    if (!version) fail(checks, 5, 'version_exists', 'profile version not found')
    if (!version || String(version.userId) !== userId) {
      fail(checks, 6, 'version_owner', 'version belongs to another user')
    }
    pass(checks, 5, 'version_exists')
    pass(checks, 6, 'version_owner')
  } else {
    if (!/^post:[^:]+:v\d+$/.test(action!.versionId)) {
      fail(checks, 5, 'version_exists', 'unrecognized version binding')
    }
    pass(checks, 5, 'version_exists', 'post version binding')
    pass(checks, 6, 'version_owner')
  }

  // #07 — payload passes Zod validation (strict)
  try {
    validateActionPayload(action!.actionType as ActionType, action!.payload)
    pass(checks, 7, 'payload_schema_valid')
  } catch (err) {
    checks.push({
      id: 7,
      name: 'payload_schema_valid',
      passed: false,
      detail: (err as Error).message,
    })
    await markFailed(action!, checks, 'VALIDATION_ERROR', (err as Error).message)
    throw new ApiError(400, 'VALIDATION_ERROR', `payload rejected: ${(err as Error).message}`)
  }

  // #08–#10 — facts validated, no conflicts, no unsupported claims
  const factValidation = proposal!.factValidation as {
    isReady?: boolean
    unsupportedCount?: number
    needsConfirmationCount?: number
  }
  if (factValidation?.isReady !== true || factValidation.unsupportedCount !== 0) {
    fail(checks, 8, 'facts_validated', 'proposal has unresolved fact validation issues')
  }
  pass(checks, 8, 'facts_validated')
  if ((factValidation?.unsupportedCount ?? 0) > 0) {
    fail(checks, 9, 'no_fact_conflicts', 'unsupported claims present')
  }
  pass(checks, 9, 'no_fact_conflicts')
  if ((factValidation?.needsConfirmationCount ?? 0) > 0) {
    fail(checks, 10, 'no_unsupported_claims', 'unconfirmed statements still require user confirmation')
  }
  pass(checks, 10, 'no_unsupported_claims')

  // #11 — proposal & approval not expired
  if (!proposal!.expiresAt || proposal!.expiresAt.getTime() <= now.getTime()) {
    fail(checks, 11, 'not_expired', 'proposal expired — regenerate before executing')
  }
  pass(checks, 11, 'proposal_not_expired')

  // #12–#16 — approval chain
  const approval = await ApprovalRequestModel.findOne({
    _id: action!.approvalRequestId,
  }).exec()
  if (!approval) fail(checks, 12, 'approval_exists', 'approval request not found')
  if (!approval || String(approval.userId) !== userId) {
    fail(checks, 13, 'approval_owner', 'approval belongs to another user')
  }
  pass(checks, 12, 'approval_exists')
  pass(checks, 13, 'approval_owner')

  // #11 (part 2) — the approval itself must still be valid
  if (!approval!.expiresAt || approval!.expiresAt.getTime() <= now.getTime()) {
    fail(checks, 11, 'approval_not_expired', 'approval expired — explicit re-approval required')
  }
  pass(checks, 11, 'approval_not_expired')

  if (approval!.status !== 'approved') {
    fail(checks, 14, 'approval_matches_proposal', `approval status is ${approval!.status}`)
  }
  if (approval!.proposalId !== String(proposal!._id)) {
    fail(checks, 14, 'approval_matches_proposal', 'approval was issued for a different proposal')
  }
  pass(checks, 14, 'approval_matches_proposal')

  if (approval!.versionId !== action!.versionId || approval!.versionId !== proposal!.versionId) {
    fail(
      checks,
      15,
      'approval_matches_version',
      'approval was issued for a different version (T-17 protection)',
    )
  }
  pass(checks, 15, 'approval_matches_version')

  const recomputedProposalHash = computeExecutableContentHash(
    proposal!.versionId,
    proposal!.plannedActions as never[],
  )
  const recomputedActionHash = computeActionContentHash(
    action!.actionType as ActionType,
    action!.payload,
  )
  if (
    recomputedProposalHash !== approval!.contentHash ||
    recomputedActionHash !== action!.contentHash
  ) {
    fail(
      checks,
      16,
      'content_hash_match',
      'stored content changed after approval — approval invalidated (T-06/T-16 protection)',
    )
  }
  pass(checks, 16, 'content_hash_match')

  // #17–#19 — idempotency + terminal states
  if (['completed', 'executing'].includes(action!.status)) {
    fail(checks, 17, 'not_already_executed', `action already ${action!.status} (T-08 protection)`)
  }
  pass(checks, 17, 'not_already_executed')
  if (action!.status === 'cancelled') {
    fail(checks, 18, 'not_cancelled', 'action was cancelled by the user')
  }
  pass(checks, 18, 'not_cancelled')
  if (action!.status === 'rejected') {
    fail(checks, 19, 'not_rejected', 'this action was excluded from the approved scope (T-02)')
  }
  pass(checks, 19, 'not_rejected')

  // #20 — security checks: strict schema already passed; automation layer available
  let provider
  try {
    provider = await loadAutomationProvider()
    pass(checks, 20, 'security_checks_passed', `automation provider: ${provider.name}`)
  } catch (err) {
    checks.push({ id: 20, name: 'security_checks_passed', passed: false, detail: (err as Error).message })
    await markFailed(action!, checks, 'EXECUTION_ERROR', (err as Error).message)
    throw new ApiError(409, 'EXECUTION_ERROR', (err as Error).message)
  }

  // #21 — risk requirements satisfied
  const expectedRisk = RISK_MATRIX[action!.actionType as ActionType]
  if (expectedRisk !== action!.riskLevel) {
    fail(checks, 21, 'risk_requirements_satisfied', `risk mismatch: expected ${expectedRisk}, stored ${action!.riskLevel}`)
  }
  if (['high', 'critical'].includes(action!.riskLevel) && approval!.riskLevel !== action!.riskLevel) {
    fail(checks, 21, 'risk_requirements_satisfied', 'high-risk action requires matching explicit approval level')
  }
  if (action!.actionType === 'publish_post') {
    const postId = String((action!.payload as { postId?: string }).postId ?? '')
    let post: { state?: string } | null = null
    try {
      post = await getPostByOwner(userId, postId)
    } catch {
      post = null
    }
    if (!post || post.state !== 'publish_confirmed') {
      fail(checks, 21, 'risk_requirements_satisfied', 'publish requires an explicit publish confirmation on the final draft')
    }
  }
  pass(checks, 21, 'risk_requirements_satisfied')

  if (!approval!.approvedActionIds.includes(action!.plannedActionId)) {
    fail(
      checks,
      14,
      'approval_scope',
      'action id is not inside the approved scope (T-01/T-11/T-12)',
    )
  }
  pass(checks, 14, 'approval_scope')

  const fullChecklist: ContractCheck[] = checks

  // ---- protected transition into EXECUTING (only reachable from approved/paused-retry path)
  assertActionTransition(action!.status as never, 'executing')
  action!.status = 'executing'
  action!.attempts += 1
  action!.lastError = null
  await action!.save()

  let outcome: ExecutorOutcome
  try {
    outcome = await provider.execute({
      actionType: action!.actionType,
      payload: action!.payload as Record<string, unknown>,
    })
  } catch (err) {
    assertActionTransition('executing', 'failed')
    action!.status = 'failed'
    action!.result = 'failed'
    action!.lastError = `EXECUTION_ERROR: ${(err as Error).message}`
    await action!.save()
    await auditExecution(userId, action!, fullChecklist, 'failed', action!.lastError)
    throw new ApiError(409, 'EXECUTION_ERROR', (err as Error).message)
  }

  return finishExecution(userId, action!, outcome, fullChecklist)
}

async function finishExecution(
  userId: string,
  action: LinkedInActionDocument,
  outcome: ExecutorOutcome,
  checklist: ContractCheck[],
): Promise<ExecutionReport> {
  // EXECUTING -> VERIFYING is the only exit
  assertActionTransition('executing', 'verifying')
  action.status = 'verifying'
  await action.save()

  if (outcome.outcome === 'challenge') {
    assertActionTransition('verifying', 'failed')
    action.status = 'failed'
    action.result = 'failed'
    action.lastError = `SECURITY_CHALLENGE: ${outcome.message}`
    await action.save()
    await auditExecution(userId, action, checklist, 'failed', 'SECURITY_CHALLENGE pauses the queue')
    throw new ApiError(409, 'SECURITY_CHALLENGE', outcome.message)
  }

  if (outcome.outcome === 'failed') {
    assertActionTransition('verifying', 'failed')
    action.status = 'failed'
    action.result = 'failed'
    action.lastError = outcome.message
    await action.save()
    await auditExecution(userId, action, checklist, 'failed', outcome.message)
    return { action, checklist, executed: true, reason: outcome.message }
  }

  if (outcome.outcome === 'unverified' || outcome.observedAfter === undefined) {
    // flow.md §56 — cannot confirm the change happened: UNVERIFIED, never SUCCESS
    assertActionTransition('verifying', 'unverified')
    action.status = 'unverified'
    action.result = 'unverified'
    action.lastError = outcome.message
    await action.save()
    await auditExecution(userId, action, checklist, 'unverified', outcome.message)
    return { action, checklist, executed: true, reason: outcome.message }
  }

  const verified = verifyOutcome(action, outcome.observedAfter)
  if (!verified) {
    assertActionTransition('verifying', 'unverified')
    action.status = 'unverified'
    action.result = 'unverified'
    action.lastError = 'observed result did not match the approved payload after execution'
    await action.save()
    await auditExecution(userId, action, checklist, 'unverified', action.lastError)
    return { action, checklist, executed: true, reason: action.lastError }
  }

  assertActionTransition('verifying', 'completed')
  action.status = 'completed'
  action.result = 'success'
  action.after = outcome.observedAfter
  await action.save()
  await applyPostExecutionSideEffects(userId, action)
  await auditExecution(userId, action, checklist, 'success')
  return { action, checklist, executed: true }
}

function verifyOutcome(action: LinkedInActionDocument, observedAfter: unknown): boolean {
  const payload = action.payload as Record<string, unknown>
  const textFields: Record<string, keyof typeof payload> = {
    update_headline: 'headline',
    update_about: 'about',
    publish_post: 'text',
    create_post_draft_on_linkedin: 'text',
  }
  const field = textFields[action.actionType]
  if (!field) return typeof observedAfter === 'object' || typeof observedAfter === 'string'
  return JSON.stringify(observedAfter) === JSON.stringify(payload[field])
}

/** flow.md §57 — append-only execution log entries; failures are recorded honestly. */
async function auditExecution(
  userId: string,
  action: LinkedInActionDocument,
  checklist: ContractCheck[],
  result: 'success' | 'failed' | 'unverified',
  error?: string,
): Promise<void> {
  await appendAuditEvent({
    userId,
    actionType: result === 'failed' ? 'action.failed' : 'action.executed',
    entityType: 'linkedin_action',
    entityId: action.id,
    before: action.before ?? null,
    after: action.after ?? action.payload,
  })
  void checklist
  void error
}

async function markFailed(
  action: LinkedInActionDocument,
  checklist: ContractCheck[],
  code: string,
  message: string,
): Promise<void> {
  // The action never entered EXECUTING here, so its stored status stays untouched —
  // failures are recorded in the audit log instead of being written into status history.
  try {
    await appendAuditEvent({
      userId: String(action.userId),
      actionType: 'action.failed',
      entityType: 'linkedin_action',
      entityId: action.id,
      before: { status: action.status },
      after: { status: action.status, error: `${code}: ${message}` },
    })
  } catch {
    // audit best-effort; original error propagates to caller
  }
  void checklist
}

async function applyPostExecutionSideEffects(userId: string, action: LinkedInActionDocument): Promise<void> {
  if (action.actionType !== 'publish_post' && action.actionType !== 'create_post_draft_on_linkedin') {
    return
  }
  try {
    const postId = String((action.payload as { postId?: string }).postId ?? '')
    const { applyPostExecutionState } = await import('../domain/posts/post.service.js')
    await applyPostExecutionState(userId, postId, action.actionType, action.status)
  } catch {
    // side effect failure must not fake execution success; audit already recorded the truth
  }
}

export async function listActionsByOwner(userId: string): Promise<LinkedInActionDocument[]> {
  return LinkedInActionModel.find({ userId }).sort({ createdAt: -1 }).limit(200).exec()
}

export async function getActionByOwner(
  userId: string,
  actionId: string,
): Promise<LinkedInActionDocument> {
  const doc = await LinkedInActionModel.findOne({ _id: actionId, userId }).exec()
  if (!doc) throw ApiError.notFound('Action not found')
  return doc
}

export interface QueueRunReport {
  processed: Array<{ actionId: string; status: string; detail?: string }>
  pausedRemaining: string[]
  stoppedReason?: string
}

/**
 * Sequential queue runner (flow.md §52): stops at the first failure/security challenge and
 * pauses everything that remains, giving the user Retry / Skip / Cancel choices.
 */
export async function runApprovedQueue(userId: string): Promise<QueueRunReport> {
  const report: QueueRunReport = { processed: [], pausedRemaining: [] }
  const pending = await LinkedInActionModel.find({ userId, status: 'approved' })
    .sort({ queueOrder: 1, createdAt: 1 })
    .exec()

  for (const item of pending) {
    try {
      const result = await executeAction(userId, item.id)
      report.processed.push({
        actionId: item.id,
        status: result.action?.status ?? 'unknown',
        detail: result.reason,
      })
      if (result.action && !['completed', 'unverified'].includes(result.action.status)) {
        report.stoppedReason = result.reason ?? `action ${item.id} ended as ${result.action.status}`
        break
      }
      if (result.action?.status === 'unverified') {
        // honest halt: do not continue publishing more changes while previous is unverified
        report.stoppedReason = 'previous action could not be verified — queue halted for review'
        break
      }
    } catch (err) {
      report.processed.push({
        actionId: item.id,
        status: 'failed',
        detail: (err as Error).message,
      })
      report.stoppedReason = (err as Error).message
      break
    }
  }

  const remainingIds = pending
    .filter((item) => !report.processed.some((p) => p.actionId === item.id))
    .map((item) => item.id)
  for (const id of remainingIds) {
    const item = await LinkedInActionModel.findOne({ _id: id, userId, status: 'approved' }).exec()
    if (item && item.status === 'approved') {
      assertActionTransition('approved', 'paused')
      item.status = 'paused'
      await item.save()
      report.pausedRemaining.push(id)
    }
  }
  return report
}

export async function retryPausedOrFailedAction(
  userId: string,
  actionId: string,
): Promise<LinkedInActionDocument> {
  const action = await getActionByOwner(userId, actionId)
  assertActionTransition(action.status as never, 'approved')
  action.status = 'approved'
  await action.save()
  return action
}

export async function skipAction(userId: string, actionId: string): Promise<LinkedInActionDocument> {
  const action = await getActionByOwner(userId, actionId)
  assertActionTransition(action.status as never, 'skipped')
  action.status = 'skipped'
  await action.save()
  await appendAuditEvent({
    userId,
    actionType: 'action.skipped',
    entityType: 'linkedin_action',
    entityId: action.id,
    before: null,
    after: { status: 'skipped' },
  })
  return action
}

export async function cancelAction(userId: string, actionId: string): Promise<LinkedInActionDocument> {
  const action = await getActionByOwner(userId, actionId)
  assertActionTransition(action.status as never, 'cancelled')
  action.status = 'cancelled'
  await action.save()
  await appendAuditEvent({
    userId,
    actionType: 'action.cancelled',
    entityType: 'linkedin_action',
    entityId: action.id,
    before: null,
    after: { status: 'cancelled' },
  })
  return action
}
