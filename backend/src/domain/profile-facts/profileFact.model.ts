import mongoose, { Schema, type Model } from 'mongoose'
import {
  FACT_CATEGORIES,
  FACT_SOURCES,
  FACT_STATUSES,
  FACT_TYPES,
  type FactCategory,
  type FactSource,
  type FactStatus,
  type FactType,
} from './profileFact.types.js'

export interface ProfileFactDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  type: FactType
  category: FactCategory
  key: string
  value: unknown
  status: FactStatus
  source: FactSource
  sourceReference?: string | null
  createdAt: Date
  updatedAt: Date
}

const profileFactSchema = new Schema<ProfileFactDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    type: { type: String, required: true, enum: FACT_TYPES },
    category: { type: String, required: true, enum: FACT_CATEGORIES },
    key: { type: String, required: true, trim: true, maxlength: 120 },
    value: { type: Schema.Types.Mixed, required: true },
    status: { type: String, required: true, enum: FACT_STATUSES },
    source: { type: String, required: true, enum: FACT_SOURCES },
    sourceReference: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true },
)

profileFactSchema.index({ userId: 1 })
profileFactSchema.index({ userId: 1, category: 1 })
profileFactSchema.index({ userId: 1, status: 1 })

profileFactSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const ProfileFactModel: Model<ProfileFactDocument> =
  (mongoose.models.ProfileFact as Model<ProfileFactDocument>) ??
  mongoose.model<ProfileFactDocument>('ProfileFact', profileFactSchema)
