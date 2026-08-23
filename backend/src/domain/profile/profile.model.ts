import mongoose, { Schema, type Model } from 'mongoose'
import type { ProfileSnapshot } from './profile.types.js'

export interface ProfileDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId
  headline: string
  about: string
  experiences: unknown[]
  educations: unknown[]
  projects: unknown[]
  skills: unknown[]
  certifications: unknown[]
  featured: unknown[]
  createdAt: Date
  updatedAt: Date
}

const profileSchema = new Schema<ProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    headline: { type: String, default: '', maxlength: 220 },
    about: { type: String, default: '', maxlength: 6000 },
    experiences: { type: [Schema.Types.Mixed], default: [] },
    educations: { type: [Schema.Types.Mixed], default: [] },
    projects: { type: [Schema.Types.Mixed], default: [] },
    skills: { type: [Schema.Types.Mixed], default: [] },
    certifications: { type: [Schema.Types.Mixed], default: [] },
    featured: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, minimize: false },
)

profileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.userId = String(result.userId)
    delete result._id
    delete result.__v
    return result
  },
})

export const ProfileModel: Model<ProfileDocument> =
  (mongoose.models.Profile as Model<ProfileDocument>) ??
  mongoose.model<ProfileDocument>('Profile', profileSchema)

export function snapshotToMongo(snapshot: ProfileSnapshot): Record<string, unknown> {
  return {
    headline: snapshot.headline,
    about: snapshot.about,
    experiences: snapshot.experiences,
    educations: snapshot.educations,
    projects: snapshot.projects,
    skills: snapshot.skills,
    certifications: snapshot.certifications,
    featured: snapshot.featured,
  }
}
