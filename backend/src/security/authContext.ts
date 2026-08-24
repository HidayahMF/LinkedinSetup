import type { NextFunction, Request, Response } from 'express'
import { resolveSession } from '../domain/auth/auth.service.js'
import { ApiError } from '../errors/apiError.js'

export interface AuthenticatedUser {
  id: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

const AUTH_SCHEME = 'bearer'

function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (!scheme || scheme.toLowerCase() !== AUTH_SCHEME || !token) return null
  return token.trim() || null
}

/**
 * flow.md §63 — request identity is UNTRUSTED until verified.
 *
 * The authenticated user comes EXCLUSIVELY from a verified session (opaque bearer
 * token resolved against the auth_sessions store). Arbitrary headers such as
 * `x-user-id` are ignored entirely and can never authorize anything.
 *
 * request → authentication verification → authenticated user → authorization → route
 */
export async function requireAuthenticatedUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      next(ApiError.unauthorized('authentication required: provide a valid bearer session token'))
      return
    }
    const userId = await resolveSession(token)
    if (!userId) {
      next(ApiError.unauthorized('invalid or expired session'))
      return
    }
    req.user = { id: userId }
    next()
  } catch (err) {
    next(err)
  }
}

export function getAuthenticatedUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized('authenticated user context required')
  return req.user.id
}

/** Returns the raw session token of a verified request (used by /auth/logout). */
export function getSessionToken(req: Request): string {
  const token = extractBearerToken(req)
  if (!token || !req.user) throw ApiError.unauthorized('authenticated user context required')
  return token
}
