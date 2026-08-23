import { findManyByOwner } from '../profile-facts/profileFact.repository.js'
import type { ProfileFactDocument } from '../profile-facts/profileFact.model.js'
import { AUTHORITATIVE_TYPES } from '../profile-facts/profileFact.types.js'

export type ClaimStatus = 'supported' | 'unsupported' | 'needs_confirmation'

export interface ClaimCheck {
  claim: string
  status: ClaimStatus
  matchedFactIds: string[]
  reason: string
}

export interface FactValidationResult {
  claims: ClaimCheck[]
  supportedCount: number
  unsupportedCount: number
  needsConfirmationCount: number
  /** flow.md §41/§41.1 — READY requires zero UNSUPPORTED and zero unresolved NEEDS_CONFIRMATION */
  isReady: boolean
}

const METRIC_PATTERN =
  /(\d+\s?%|\bx\s?\d+\b|\b\d[\d.,]*\s?(k|m|million|billion)\b|\b\d[\d.,]*\s?\+?\s?(users|customers|clients|requests|downloads|installs|uptime|revenue|growth)\b|\$\s?\d[\d.,]*|\b\d+\s?(hours?|days?)\b)/i

const STRONG_CLAIM_PATTERN =
  /\b(led|managed|founded|co-?founded|architected|owned|increased|decreased|improved|reduced|achieved|won|award(ed)?|ranked|promoted|mentored|hired|built the (backend|frontend)|team of)\b/i

/**
 * Instruction-override phrasing (flow.md §64/§65): profile content that tries to talk like a
 * command is DATA and is flagged unsupported so it never reaches an executable payload.
 */
const INJECTION_PATTERN =
  /\b(ignore|disregard|forget)\b[\s\S]{0,40}?\binstructions?\b|\byou\s+are\b[\s\S]{0,30}?\b(ai|assistant|chatgpt|llm)\b/i

const IGNORED_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'for',
  'with',
  'at',
  'on',
  'in',
  'to',
  'of',
  'i',
  'my',
  'we',
  'our',
  'this',
  'that',
  'these',
  'those',
])

/**
 * Generic professional vocabulary — these describe roles/disciplines, not verifiable
 * entities. They never count as factual claims on their own (flow.md §4.2: wording ≠ facts).
 */
const GENERIC_ROLE_WORDS = new Set([
  'developer',
  'engineer',
  'engineering',
  'intern',
  'junior',
  'senior',
  'lead',
  'manager',
  'designer',
  'analyst',
  'consultant',
  'specialist',
  'enthusiast',
  'student',
  'software',
  'web',
  'mobile',
  'backend',
  'frontend',
  'fullstack',
  'stack',
  'devops',
  'quality',
  'assurance',
  'product',
  'project',
  'data',
  'science',
  'scientist',
  'machine',
  'learning',
  'artificial',
  'intelligence',
  'cloud',
  'native',
  'marketing',
  'sales',
  'finance',
  'people',
  'growth',
  'content',
  'community',
  'builder',
  'practical',
])

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function extractCandidateKeywords(sentence: string): string[] {
  const candidates: string[] = []
  // technology-looking tokens anywhere in the sentence
  const techish = sentence.match(/\b[\w.#+-]*(?:\.js|\.ts|\.net|\+\+|#|SQL|DB)[\w+#.-]*/gi) ?? []
  candidates.push(...techish.map((t) => t.replace(/[.,;:]$/, '')))
  // proper nouns NOT at sentence start (sentence-initial capitals are usually just grammar)
  const tokens = sentence.split(/\s+/)
  for (let i = 1; i < tokens.length; i += 1) {
    const clean = tokens[i]
      .replace(/[^A-Za-z0-9.#+-]/g, '')
      .replace(/[.,;:!]+$/, '')
    if (/^[A-Z][a-zA-Z]{2,}/.test(clean) && !IGNORED_WORDS.has(clean.toLowerCase())) {
      candidates.push(clean)
    }
  }
  return [
    ...new Set(
      candidates
        .map((c) => c.trim())
        .filter(Boolean)
        // generic role/discipline words are wording, not factual entities
        .filter((c) => !GENERIC_ROLE_WORDS.has(c.toLowerCase())),
    ),
  ]
}

async function loadVerifiedFacts(
  userId: string,
): Promise<Array<{ id: string; key: string; valueText: string }>> {
  const docs = await findManyByOwner(userId, { status: 'verified' }, 500)
  return docs.filter((d) => AUTHORITATIVE_TYPES.includes(d.type)).map(toFactEntry)
}

function toFactEntry(doc: ProfileFactDocument): { id: string; key: string; valueText: string } {
  const raw = doc.value
  const valueText =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.join(', ')
        : raw && typeof raw === 'object'
          ? Object.values(raw as Record<string, unknown>)
              .filter((v) => v !== null && v !== undefined)
              .join(', ')
          : String(raw ?? '')
  return { id: String(doc._id), key: doc.key, valueText }
}

/**
 * Validates factual claims in free text against VERIFIED facts only (flow.md §26, §37, §41).
 * Deterministic heuristics — never guesses. Anything not backed by a verified fact is flagged,
 * never silently accepted.
 */
export async function validateTextAgainstFacts(
  userId: string,
  text: string,
): Promise<FactValidationResult> {
  const facts = await loadVerifiedFacts(userId)
  const corpus = facts.map((f) => `${f.key} ${f.valueText}`.toLowerCase())
  const claims: ClaimCheck[] = []

  function findMatchingFacts(needle: string): string[] {
    const n = needle.toLowerCase()
    const ids = new Set<string>()
    corpus.forEach((entry, index) => {
      if (n.length >= 3 && entry.includes(n)) ids.add(facts[index].id)
    })
    return [...ids]
  }

  // flow.md §3.1 — with NO verified facts at all, nothing can be presented as supported
  for (const sentence of splitSentences(text)) {
    if (facts.length === 0) {
      claims.push({
        claim: sentence,
        status: 'needs_confirmation',
        matchedFactIds: [],
        reason: 'no verified facts exist yet — confirm the underlying facts first',
      })
    }
  }
  if (facts.length === 0) {
    return finalize(claims)
  }

  for (const sentence of splitSentences(text)) {
    if (INJECTION_PATTERN.test(sentence)) {
      claims.push({
        claim: sentence,
        status: 'unsupported',
        matchedFactIds: [],
        reason: 'instruction-like content is treated as data, never as a command (flow.md §64/§65)',
      })
      continue
    }
    const metricMatch = sentence.match(METRIC_PATTERN)
    if (metricMatch) {
      const matched = findMatchingFacts(metricMatch[0].trim())
      claims.push({
        claim: sentence,
        status: matched.length > 0 ? 'supported' : 'unsupported',
        matchedFactIds: matched,
        reason:
          matched.length > 0
            ? 'metric backed by a verified fact'
            : `metric "${metricMatch[0].trim()}" has no verified source — ASK USER FOR METRIC (flow.md §4.1)`,
      })
      continue
    }

    const keywords = extractCandidateKeywords(sentence)
    const unmatched: string[] = []
    let hasMatch = false
    const matchedIds = new Set<string>()
    for (const keyword of keywords) {
      const matched = findMatchingFacts(keyword)
      if (matched.length > 0) {
        hasMatch = true
        matched.forEach((id) => matchedIds.add(id))
      } else {
        unmatched.push(keyword)
      }
    }

    if (keywords.length === 0 && !STRONG_CLAIM_PATTERN.test(sentence)) {
      claims.push({
        claim: sentence,
        status: 'supported',
        matchedFactIds: [],
        reason: 'wording-only statement without factual claims',
      })
      continue
    }

    if (hasMatch && unmatched.length === 0) {
      claims.push({
        claim: sentence,
        status: 'supported',
        matchedFactIds: [...matchedIds],
        reason: 'all named entities are backed by verified facts',
      })
      continue
    }

    const strongClaim = STRONG_CLAIM_PATTERN.test(sentence)
    claims.push({
      claim: sentence,
      status: strongClaim || unmatched.length > 0 ? 'needs_confirmation' : 'needs_confirmation',
      matchedFactIds: [...matchedIds],
      reason:
        strongClaim && unmatched.length > 0
          ? `strong claim with unconfirmed entities (${unmatched.join(', ')})`
          : strongClaim
            ? 'strong professional claim requires explicit confirmation (flow.md §4.2)'
            : `unconfirmed entities: ${unmatched.join(', ')}`,
    })
  }

  return finalize(claims)
}

function finalize(claims: ClaimCheck[]): FactValidationResult {
  const supportedCount = claims.filter((c) => c.status === 'supported').length
  const unsupportedCount = claims.filter((c) => c.status === 'unsupported').length
  const needsConfirmationCount = claims.filter((c) => c.status === 'needs_confirmation').length

  return {
    claims,
    supportedCount,
    unsupportedCount,
    needsConfirmationCount,
    isReady: unsupportedCount === 0 && needsConfirmationCount === 0,
  }
}

export async function validateSectionsAgainstFacts(
  userId: string,
  texts: Array<{ field: string; text: string }>,
): Promise<FactValidationResult> {
  const merged = texts.map((t) => t.text).filter(Boolean).join('\n')
  if (!merged.trim()) {
    return {
      claims: [],
      supportedCount: 0,
      unsupportedCount: 0,
      needsConfirmationCount: 0,
      isReady: false,
    }
  }
  return validateTextAgainstFacts(userId, merged)
}
