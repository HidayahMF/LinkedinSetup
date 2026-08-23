import { createHash } from 'node:crypto'

/**
 * Deterministic canonical JSON (flow.md §45.1):
 * - lexicographic key ordering
 * - UTF-8 encoding
 * - no whitespace variance
 * - volatile fields (timestamps, random ids) must be stripped by callers before hashing
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Non-finite numbers cannot be hashed deterministically')
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    const entry = record[key]
    if (entry === undefined) continue
    result[key] = canonicalize(entry)
  }
  return result
}

export function contentHash(executablePayload: unknown): string {
  return createHash('sha256').update(canonicalJson(executablePayload), 'utf8').digest('hex')
}
