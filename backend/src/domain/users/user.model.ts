import mongoose, { Schema, type Model } from 'mongoose'

export interface UserDocument extends mongoose.Document {
  email: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDocument>(
  {
    // flow.md §62/§57 — only a scrypt hash is stored; the plaintext password and
    // its hash never leave this collection or appear in any API response/log.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
)

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const result = ret as unknown as Record<string, unknown>
    result.id = String(result._id)
    delete result._id
    delete result.__v
    delete result.passwordHash
    return result
  },
})

export const UserModel: Model<UserDocument> =
  (mongoose.models.User as Model<UserDocument>) ??
  mongoose.model<UserDocument>('User', userSchema)
