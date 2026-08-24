import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../errors/apiError.js'

/**
 * Minimal in-memory fixed-window rate limiter (flow.md §71 — local-first,
 * dependency-free). State is PROCESS-LOCAL: it does not survive restarts and is
 * not shared across instances. For a single-process local deployment this is the
 * correct trade-off; horizontal deployments would need a shared store, which is
 * explicitly out of scope (C14 — do not overengineer).
 *
 * Buckets are keyed by route + client IP ONLY. No password, email or token data
 * is ever stored in limiter state.
 */

interface WindowBucket {
  count: number
  resetAt: number
}

interface LimiterOptions {
  /** Unique route key so login and register have independent budgets. */
  name: string
  windowMs: number
  max: number
}

const buckets = new Map<string, WindowBucket>()

function clientKey(req: Request): string {
  // Express resolves req.ip from the socket peer by default (trust proxy off),
  // which cannot be spoofed by headers in this deployment shape.
  return `${req.ip ?? 'unknown'}`
}

export function rateLimit(options: LimiterOptions) {
  return function rateLimitMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const now = Date.now()
    const key = `${options.name}|${clientKey(req)}`
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1

    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      _res.setHeader('Retry-After', String(retryAfterSec))
      next(
        new ApiError(429, 'RATE_LIMITED', 'too many attempts — try again later'),
      )
      return
    }
    next()
  }
}

/** Test/maintenance hook: clears all buckets. Not exposed via any HTTP endpoint. */
export function resetRateLimits(): void {
  buckets.clear()
}
