import mongoose, { Schema, type Model } from 'mongoose'
import type { ActionState } from '../../state-machine/states.js'
import { ACTION_STATES } from '../../state-machine/states.js'
import type { ActionType } from '../actionTypes.js'
import type { RiskLevel } from '../../domain/approval/approval.model.js'

export type ExecutorOutcomeKind = 'success' | 'failed' | 'unverified'

export interface LinkedInActionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  proposalId: string
  versionId: string
  approvalRequestId: string
  plannedActionId: string
  actionType: ActionType
  riskLevel: RiskLevel
  targetField: string
  summary: string
  payload: Record<string, unknown>
  contentHash: string
  status: ActionState
  attempts: number
  lastError?: string | null
  result?: ExecutorOutcomeKind | null
  before?: unknown
  after?: unknown
  queueOrder: number
  createdAt: Date
  updatedAt: Date
}

const linkedInActionSchema = new Schema<LinkedInActionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    proposalId: { type: String, required: true },
    versionId: { type: String, required: true },
    approvalRequestId: { type: String, required: true },
    plannedActionId: { type: String, required: true },
    actionType: { type: String, required: true },
    riskLevel: { type: String, required: true },
    targetField: { type: String, required: true, maxlength: 120 },
    summary: { type: String, default: '', maxlength: 500 },
    payload: { type: Schema.Types.Mixed, required: true },
    contentHash: { type: String, required: true },
    status: { type: String, required: true, enum: ACTION_STATES },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null, maxlength: 1000 },
    result: { type: String, enum: ['success', 'failed', 'unverified', null], default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    queueOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

linkedInActionSchema.index({ userId: 1, status: 1 })
linkedInActionSchema.index({ proposalId: 1 })

linkedInActionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const LinkedInActionModel: Model<LinkedInActionDocument> =
  (mongoose.models.LinkedInAction as Model<LinkedInActionDocument>) ??
  mongoose.model<LinkedInActionDocument>('LinkedInAction', linkedInActionSchema)
