import type { Request, Response } from 'express'

/**
 * Security headers for the API (C2). Applied globally — responses are JSON only.
 * A restrictive CSP is safe here because the Express app serves no HTML/scripts;
 * the Vite dev server (which needs its own relaxed CSP) is a separate process
 * and is unaffected. No external dependency required.
 */
export function securityHeaders(_req: Request, res: Response, next: () => void): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // API serves JSON only: no sources needed; framing and base-uri hijack denied.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  )
  next()
}
