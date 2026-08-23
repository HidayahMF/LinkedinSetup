import mongoose, { Schema, type Model } from 'mongoose'

export interface ReviewDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  target: string
  strengths: string[]
  issues: string[]
  unsupportedClaims: string[]
  missingInformation: string[]
  recommendations: string[]
  optionalImprovements: string[]
  scores: Record<string, number>
  overall: number
  createdAt: Date
}

const reviewSchema = new Schema<ReviewDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    target: { type: String, required: true, maxlength: 120 },
    strengths: { type: [String], default: [] },
    issues: { type: [String], default: [] },
    unsupportedClaims: { type: [String], default: [] },
    missingInformation: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    optionalImprovements: { type: [String], default: [] },
    scores: { type: Schema.Types.Mixed, default: {} },
    overall: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)

reviewSchema.index({ userId: 1, createdAt: -1 })

reviewSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const ReviewModel: Model<ReviewDocument> =
  (mongoose.models.Review as Model<ReviewDocument>) ??
  mongoose.model<ReviewDocument>('Review', reviewSchema)
