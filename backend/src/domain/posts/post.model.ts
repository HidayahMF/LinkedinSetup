import mongoose, { Schema, type Model } from 'mongoose'
import { POST_STATES, type PostState } from '../../state-machine/states.js'

export interface PostDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  title?: string | null
  text: string
  finalText?: string | null
  state: PostState
  versionTag: number
  factValidation: {
    claims: unknown[]
    supportedCount: number
    unsupportedCount: number
    needsConfirmationCount: number
    isReady: boolean
  } | null
  contentHash: string | null
  publishProposalId: string | null
  publishedAt: Date | null
  verificationResult: 'published' | 'unverified' | null
  createdAt: Date
  updatedAt: Date
}

const postSchema = new Schema<PostDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, default: null, maxlength: 300 },
    text: { type: String, required: true, maxlength: 3000 },
    finalText: { type: String, default: null, maxlength: 3000 },
    state: { type: String, required: true, enum: POST_STATES, default: 'draft' },
    versionTag: { type: Number, default: 1 },
    factValidation: { type: Schema.Types.Mixed, default: null },
    contentHash: { type: String, default: null },
    publishProposalId: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    verificationResult: { type: String, enum: ['published', 'unverified', null], default: null },
  },
  { timestamps: true },
)

postSchema.index({ userId: 1, state: 1 })

postSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const PostModel: Model<PostDocument> =
  (mongoose.models.Post as Model<PostDocument>) ?? mongoose.model<PostDocument>('Post', postSchema)
