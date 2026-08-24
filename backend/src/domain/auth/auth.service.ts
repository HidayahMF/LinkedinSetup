import { Types } from 'mongoose'
import { ApiError } from '../../errors/apiError.js'
import { env } from '../../config/env.js'
import { UserModel, type UserDocument } from '../users/user.model.js'
import { AuthSessionModel } from './authSession.model.js'
import { hashPassword, verifyPassword } from '../../security/password.js'
import { generateSessionToken, hashToken } from '../../security/tokens.js'

export interface PublicUser {
  id: string
  email: string
}

export interface AuthResult {
  user: PublicUser
  token: string
  expiresAt: Date
}

export function sessionTtlMs(): number {
  return env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000
}

function toPublicUser(user: UserDocument): PublicUser {
  return { id: String(user._id), email: user.email }
}

async function createSession(userId: Types.ObjectId): Promise<AuthResult['token'] & string> {
  const token = generateSessionToken()
  await AuthSessionModel.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + sessionTtlMs()),
  })
  return token
}

/**
 * flow.md §71 — authentication/session management. Identity is established ONLY here:
 * a verified credential exchange produces an opaque bearer token bound to the user.
 * Nothing else in the system is allowed to assert a user identity.
 */
export async function registerUser(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase()
  const existing = await UserModel.findOne({ email: normalized }).exec()
  if (existing) throw new ApiError(409, 'VALIDATION_ERROR', 'an account with this email already exists')
  const passwordHash = await hashPassword(password)
  let user: UserDocument
  try {
    user = await UserModel.create({ email: normalized, passwordHash })
  } catch {
    // unique-index race — treat exactly like the pre-check above
    throw new ApiError(409, 'VALIDATION_ERROR', 'an account with this email already exists')
  }
  const token = await createSession(user._id)
  return {
    user: toPublicUser(user),
    token,
    expiresAt: new Date(Date.now() + sessionTtlMs()),
  }
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase()
  const user = await UserModel.findOne({ email: normalized }).exec()
  // Generic failure for both unknown user and wrong password — no account enumeration.
  if (!user) throw ApiError.unauthorized('invalid credentials')
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw ApiError.unauthorized('invalid credentials')
  const token = await createSession(user._id)
  return {
    user: toPublicUser(user),
    token,
    expiresAt: new Date(Date.now() + sessionTtlMs()),
  }
}

/** Resolves a bearer token to its verified owner. Returns null when invalid/expired. */
export async function resolveSession(token: string): Promise<string | null> {
  const session = await AuthSessionModel.findOne({ tokenHash: hashToken(token) }).exec()
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await AuthSessionModel.deleteOne({ _id: session._id }).exec()
    return null
  }
  session.lastUsedAt = new Date()
  await session.save()
  return String(session.userId)
}

export async function logoutSession(token: string): Promise<void> {
  await AuthSessionModel.deleteOne({ tokenHash: hashToken(token) }).exec()
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  if (!Types.ObjectId.isValid(userId)) return null
  const user = await UserModel.findById(userId).exec()
  return user ? toPublicUser(user) : null
}
