import mongoose, { Schema, type Model } from 'mongoose'

export type AuditActionType =
  | 'profile_fact.created'
  | 'profile_fact.updated'
  | 'profile_fact.deleted'
  | 'profile.updated'
  | 'version.restored'
  | 'proposal.created'
  | 'proposal.edited'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'approval.created'
  | 'action.planned'
  | 'action.executed'
  | 'action.failed'
  | 'action.cancelled'
  | 'action.skipped'
  | 'state.transition'
  | 'post.created'
  | 'post.updated'
  | 'post.publish_requested'
  | 'post.publish_confirmed'
  | 'review.generated'
  | 'agent.command'
  | 'auth.registered'
  | 'auth.login'
  | 'auth.logout'

export interface AuditEventDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  actionType: AuditActionType
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  timestamp: Date
}

const auditEventSchema = new Schema<AuditEventDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    actionType: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
)

auditEventSchema.index({ userId: 1, timestamp: -1 })
auditEventSchema.index({ entityType: 1, entityId: 1 })

export const AuditEventModel: Model<AuditEventDocument> =
  (mongoose.models.AuditEvent as Model<AuditEventDocument>) ??
  mongoose.model<AuditEventDocument>('AuditEvent', auditEventSchema)
