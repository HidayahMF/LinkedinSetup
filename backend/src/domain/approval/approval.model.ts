import mongoose, { Schema, type Model } from 'mongoose'

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export interface ApprovalChangeRecord {
  field: string
  before: unknown
  after: unknown
  reason: string
}

export interface ApprovalRequestDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  proposalId: string
  versionId: string
  contentHash: string
  summary: string
  changes: ApprovalChangeRecord[]
  riskLevel: RiskLevel
  status: ApprovalStatus
  plannedActionIds: string[]
  plannedActions: unknown[]
  approvedActionIds: string[]
  rejectedActionIds: string[]
  expiresAt: Date
  approvedAt?: Date | null
  rejectedAt?: Date | null
  cancellationReason?: string | null
  createdAt: Date
  updatedAt: Date
}

const changeSchema = new Schema(
  {
    field: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
  },
  { _id: false },
)

const approvalRequestSchema = new Schema<ApprovalRequestDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    proposalId: { type: String, required: true },
    versionId: { type: String, required: true },
    contentHash: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 1000 },
    changes: { type: [changeSchema], default: [] },
    riskLevel: { type: String, required: true, enum: RISK_LEVELS },
    status: { type: String, required: true, enum: APPROVAL_STATUSES, default: 'pending' },
    plannedActionIds: { type: [String], default: [] },
    plannedActions: { type: [Schema.Types.Mixed], default: [] },
    approvedActionIds: { type: [String], default: [] },
    rejectedActionIds: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true },
)

approvalRequestSchema.index({ userId: 1, status: 1 })
approvalRequestSchema.index({ proposalId: 1 })

approvalRequestSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const ApprovalRequestModel: Model<ApprovalRequestDocument> =
  (mongoose.models.ApprovalRequest as Model<ApprovalRequestDocument>) ??
  mongoose.model<ApprovalRequestDocument>('ApprovalRequest', approvalRequestSchema)
