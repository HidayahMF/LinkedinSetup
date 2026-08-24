import { createHash, randomBytes } from 'node:crypto'

/** Cryptographically random opaque bearer token (256 bits, URL-safe). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Only the SHA-256 digest of the token is persisted — a database leak cannot be
 * replayed as a valid session (flow.md §62: no plaintext session secrets).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
