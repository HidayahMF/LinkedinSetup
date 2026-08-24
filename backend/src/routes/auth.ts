import { Router } from 'express'
import { z } from 'zod'
import { ApiError } from '../errors/apiError.js'
import {
  getAuthenticatedUserId,
  getSessionToken,
  requireAuthenticatedUser,
} from '../security/authContext.js'
import { rateLimit } from '../security/rateLimit.js'
import { getUserById, loginUser, logoutSession, registerUser } from '../domain/auth/auth.service.js'
import { appendAuditEvent } from '../audit/audit.service.js'

export const authRouter = Router()

const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(200),
  })
  .strict()

/**
 * Brute-force / abuse protection (Phase C1). Keyed by client IP per route —
 * never by userId (attackers are unauthenticated at this point) and never by
 * credential material. Buckets are process-local memory; see rateLimit.ts.
 */
const loginLimiter = rateLimit({ name: 'auth-login', windowMs: 15 * 60_000, max: 10 })
const registerLimiter = rateLimit({ name: 'auth-register', windowMs: 60 * 60_000, max: 50 })

/**
 * flow.md §57 — auth lifecycle is audited. Only the user id and outcome are
 * recorded; credentials (email/password/token) are NEVER logged.
 */
authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = credentialsSchema.parse(req.body)
  const result = await registerUser(input.email, input.password)
  await appendAuditEvent({
    userId: result.user.id,
    actionType: 'auth.registered',
    entityType: 'user',
    entityId: result.user.id,
    before: null,
    after: { email: result.user.email },
  })
  res.status(201).json(result)
})

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = credentialsSchema.parse(req.body)
  const result = await loginUser(input.email, input.password)
  await appendAuditEvent({
    userId: result.user.id,
    actionType: 'auth.login',
    entityType: 'user',
    entityId: result.user.id,
    before: null,
    after: { sessionId: '[redacted]' },
  })
  res.json(result)
})

// Everything below requires a verified session.
authRouter.use(['/me', '/logout'], requireAuthenticatedUser)

authRouter.get('/me', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const user = await getUserById(userId)
  if (!user) throw new ApiError(401, 'AUTHENTICATION_ERROR', 'account no longer exists')
  res.json({ user })
})

authRouter.post('/logout', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const token = getSessionToken(req)
  await logoutSession(token)
  await appendAuditEvent({
    userId,
    actionType: 'auth.logout',
    entityType: 'user',
    entityId: userId,
    before: null,
    after: null,
  })
  res.json({ ok: true })
})
