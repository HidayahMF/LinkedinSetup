import mongoose, { Schema, type Model } from 'mongoose'
import type { ProfileSnapshot } from '../profile/profile.types.js'

export const VERSION_SOURCES = [
  'original',
  'user_edit',
  'ai_proposal',
  'restore',
  'execution',
  'post',
] as const

export type VersionSource = (typeof VERSION_SOURCES)[number]

export interface ProfileVersionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  versionNumber: number
  source: VersionSource
  label: string
  snapshot: ProfileSnapshot
  proposalId?: string | null
  createdAt: Date
}

const profileVersionSchema = new Schema<ProfileVersionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    versionNumber: { type: Number, required: true },
    source: { type: String, required: true, enum: VERSION_SOURCES },
    label: { type: String, default: '', maxlength: 300 },
    snapshot: { type: Schema.Types.Mixed, required: true },
    proposalId: { type: String, default: null },
  },
  { timestamps: true },
)

profileVersionSchema.index({ userId: 1, versionNumber: 1 }, { unique: true })

profileVersionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const ProfileVersionModel: Model<ProfileVersionDocument> =
  (mongoose.models.ProfileVersion as Model<ProfileVersionDocument>) ??
  mongoose.model<ProfileVersionDocument>('ProfileVersion', profileVersionSchema)
