import mongoose, { Schema, type Model } from 'mongoose'
import { PROPOSAL_STATES, type ProposalState } from '../../state-machine/states.js'
import type { RiskLevel } from '../approval/approval.model.js'

export type ProposalTargetType = 'profile' | 'post'

export interface ProposalChangeRecord {
  field: string
  before: unknown
  after: unknown
  reason: string
  supportedFacts: string[]
  unsupportedClaims: string[]
}

export interface PlannedActionRecord {
  actionId: string
  actionType: string
  riskLevel: RiskLevel
  targetField: string
  summary: string
  payload: Record<string, unknown>
}

export interface FactValidationSummary {
  claims: unknown[]
  supportedCount: number
  unsupportedCount: number
  needsConfirmationCount: number
  isReady: boolean
}

export interface ProposalDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  title: string
  targetType: ProposalTargetType
  targetField: string
  itemId?: string | null
  postId?: string | null
  state: ProposalState
  changes: ProposalChangeRecord[]
  plannedActions: PlannedActionRecord[]
  factValidation: FactValidationSummary
  versionId: string
  proposalVersion: number
  contentHash: string
  expiresAt: Date
  approvalRequestId?: string | null
  questions: string[]
  createdBy: 'ai' | 'user'
  createdAt: Date
  updatedAt: Date
}

const changeSchema = new Schema(
  {
    field: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    supportedFacts: { type: [String], default: [] },
    unsupportedClaims: { type: [String], default: [] },
  },
  { _id: false },
)

const plannedActionSchema = new Schema(
  {
    actionId: { type: String, required: true },
    actionType: { type: String, required: true },
    riskLevel: { type: String, required: true },
    targetField: { type: String, required: true },
    summary: { type: String, default: '' },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
)

const proposalSchema = new Schema<ProposalDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, maxlength: 300 },
    targetType: { type: String, required: true, enum: ['profile', 'post'] },
    targetField: { type: String, required: true, maxlength: 120 },
    itemId: { type: String, default: null },
    postId: { type: String, default: null },
    state: { type: String, required: true, enum: PROPOSAL_STATES },
    changes: { type: [changeSchema], default: [] },
    plannedActions: { type: [plannedActionSchema], default: [] },
    factValidation: { type: Schema.Types.Mixed, required: true },
    versionId: { type: String, required: true },
    proposalVersion: { type: Number, required: true, default: 1 },
    contentHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    approvalRequestId: { type: String, default: null },
    questions: { type: [String], default: [] },
    createdBy: { type: String, enum: ['ai', 'user'], default: 'ai' },
  },
  { timestamps: true, minimize: false },
)

proposalSchema.index({ userId: 1, state: 1 })

proposalSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const ProposalModel: Model<ProposalDocument> =
  (mongoose.models.Proposal as Model<ProposalDocument>) ??
  mongoose.model<ProposalDocument>('Proposal', proposalSchema)
