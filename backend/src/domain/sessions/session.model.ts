import mongoose, { Schema, type Model } from 'mongoose'

export interface AgentSessionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  lastIntent?: string | null
  lastTarget?: string | null
  pendingQuestions: string[]
  recentProposalIds: string[]
  recentPostIds: string[]
  createdAt: Date
  updatedAt: Date
}

const agentSessionSchema = new Schema<AgentSessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    lastIntent: { type: String, default: null },
    lastTarget: { type: String, default: null },
    pendingQuestions: { type: [String], default: [] },
    recentProposalIds: { type: [String], default: [] },
    recentPostIds: { type: [String], default: [] },
  },
  { timestamps: true },
)

agentSessionSchema.index({ userId: 1 })

agentSessionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const AgentSessionModel: Model<AgentSessionDocument> =
  (mongoose.models.AgentSession as Model<AgentSessionDocument>) ??
  mongoose.model<AgentSessionDocument>('AgentSession', agentSessionSchema)

export interface AgentCommandDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  sessionId: string
  command: string
  intent: string
  replyKind: string
  proposalId?: string | null
  postId?: string | null
  createdAt: Date
}

const agentCommandSchema = new Schema<AgentCommandDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    sessionId: { type: String, required: true },
    command: { type: String, required: true, maxlength: 2000 },
    intent: { type: String, required: true },
    replyKind: { type: String, required: true },
    proposalId: { type: String, default: null },
    postId: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
)

agentCommandSchema.index({ userId: 1, sessionId: 1, createdAt: -1 })

export const AgentCommandModel: Model<AgentCommandDocument> =
  (mongoose.models.AgentCommand as Model<AgentCommandDocument>) ??
  mongoose.model<AgentCommandDocument>('AgentCommand', agentCommandSchema)
