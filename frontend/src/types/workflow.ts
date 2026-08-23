export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ProposalState =
  | 'proposed'
  | 'needs_user_input'
  | 'user_editing'
  | 'fact_validated'
  | 'waiting_for_approval'
  | 'approved'
  | 'ready_to_execute'
  | 'content_changed'
  | 'rejected'
  | 'cancelled'
  | 'failed'

export interface PlannedAction {
  actionId: string
  actionType: string
  riskLevel: RiskLevel
  targetField: string
  summary: string
  payload: Record<string, unknown>
}

export interface FactValidationSummary {
  claims: Array<{ claim: string; status: 'supported' | 'unsupported' | 'needs_confirmation'; matchedFactIds: string[]; reason: string }>
  supportedCount: number
  unsupportedCount: number
  needsConfirmationCount: number
  isReady: boolean
}

export interface ProposalChange {
  field: string
  before: unknown
  after: unknown
  reason: string
  supportedFacts: string[]
  unsupportedClaims: string[]
}

export interface Proposal {
  id: string
  userId: string
  title: string
  targetType: 'profile' | 'post'
  targetField: string
  itemId?: string | null
  postId?: string | null
  state: ProposalState
  changes: ProposalChange[]
  plannedActions: PlannedAction[]
  factValidation: FactValidationSummary
  versionId: string
  proposalVersion: number
  contentHash: string
  expiresAt: string
  approvalRequestId?: string | null
  questions: string[]
  createdBy: string
  createdAt: string
}

export interface ApprovalRequest {
  id: string
  userId: string
  proposalId: string
  versionId: string
  contentHash: string
  summary: string
  changes: unknown[]
  riskLevel: RiskLevel
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  plannedActionIds: string[]
  approvedActionIds: string[]
  rejectedActionIds: string[]
  expiresAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
  cancellationReason?: string | null
  createdAt: string
}

export type ActionState =
  | 'approved'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'skipped'
  | 'cancelled'
  | 'unverified'
  | 'rejected'

export interface LinkedInAction {
  id: string
  userId: string
  proposalId: string
  versionId: string
  approvalRequestId: string
  actionType: string
  riskLevel: RiskLevel
  targetField: string
  summary: string
  payload: Record<string, unknown>
  contentHash: string
  status: ActionState
  attempts: number
  lastError?: string | null
  result?: 'success' | 'failed' | 'unverified' | null
  queueOrder: number
  createdAt: string
}

export interface ContractCheck {
  id: number
  name: string
  passed: boolean
  detail?: string
}
