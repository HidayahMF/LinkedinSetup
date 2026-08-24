import mongoose, { Schema, type Model } from 'mongoose'

export interface AuthSessionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  /** SHA-256 hex digest of the bearer token — raw token is never stored. */
  tokenHash: string
  expiresAt: Date
  lastUsedAt: Date
  createdAt: Date
}

const authSessionSchema = new Schema<AuthSessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
)

authSessionSchema.index({ userId: 1 })
// Sessions are self-cleaning: MongoDB removes expired documents automatically.
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

authSessionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.tokenHash
    return result
  },
})

export const AuthSessionModel: Model<AuthSessionDocument> =
  (mongoose.models.AuthSession as Model<AuthSessionDocument>) ??
  mongoose.model<AuthSessionDocument>('AuthSession', authSessionSchema)
