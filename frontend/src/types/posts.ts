export type PostState =
  | 'idea'
  | 'draft'
  | 'ai_review'
  | 'user_editing'
  | 'blocked_fact_check'
  | 'final_draft'
  | 'waiting_approval'
  | 'approved'
  | 'publish_confirmed'
  | 'publishing'
  | 'published'
  | 'unverified'
  | 'cancelled'

export interface PostFactValidation {
  claims: Array<{ claim: string; status: 'supported' | 'unsupported' | 'needs_confirmation'; reason: string }>
  supportedCount: number
  unsupportedCount: number
  needsConfirmationCount: number
  isReady: boolean
}

export interface Post {
  id: string
  userId: string
  title?: string | null
  text: string
  finalText?: string | null
  state: PostState
  versionTag: number
  factValidation: PostFactValidation | null
  publishProposalId: string | null
  publishedAt?: string | null
  verificationResult?: 'published' | 'unverified' | null
  createdAt: string
}

export interface AuditLogEntry {
  id?: string
  actionType: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  timestamp: string
}

export interface ReviewResult {
  id: string
  target: string
  strengths: string[]
  issues: string[]
  unsupportedClaims: string[]
  missingInformation: string[]
  recommendations: string[]
  optionalImprovements: string[]
  scores: Record<string, number>
  overall: number
  createdAt: string
}
