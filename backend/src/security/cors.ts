import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'

/**
 * CORS allowlist for the authenticated API (C3).
 *
 * - Only origins explicitly configured via CORS_ORIGINS are accepted.
 * - No wildcard `*` is ever emitted.
 * - Credentials (cookies) are NOT enabled — the API authenticates with Bearer
 *   session tokens, so `Access-Control-Allow-Credentials` stays off.
 * - Requests without an Origin header (curl, tests, same-origin through the
 *   Vite proxy) are not subject to the check; CORS never replaces authorization
 *   and every protected route still requires a verified session.
 */

const ALLOWED_ORIGINS = new Set(
  env.CORS_ORIGINS.split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean),
)

function isAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin.toLowerCase())
}

export function corsAllowlist(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header('origin')

  // Non-browser clients and same-origin proxied requests: no CORS processing.
  if (!origin) {
    next()
    return
  }

  if (!isAllowed(origin)) {
    res.status(403).json({ error: 'FORBIDDEN_ORIGIN', message: 'origin not allowed' })
    return
  }

  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
    res.status(204).end()
    return
  }

  next()
}
