import { ApiError } from '../errors/apiError.js'

export const PROPOSAL_STATES = [
  'proposed',
  'needs_user_input',
  'user_editing',
  'fact_validated',
  'waiting_for_approval',
  'approved',
  'ready_to_execute',
  'content_changed',
  'rejected',
  'cancelled',
  'failed',
] as const

export type ProposalState = (typeof PROPOSAL_STATES)[number]

export const ACTION_STATES = [
  'approved',
  'executing',
  'verifying',
  'completed',
  'failed',
  'paused',
  'skipped',
  'cancelled',
  'unverified',
  'rejected',
] as const

export type ActionState = (typeof ACTION_STATES)[number]

export const POST_STATES = [
  'idea',
  'draft',
  'ai_review',
  'user_editing',
  'blocked_fact_check',
  'final_draft',
  'waiting_approval',
  'approved',
  'publish_confirmed',
  'publishing',
  'published',
  'unverified',
  'cancelled',
] as const

export type PostState = (typeof POST_STATES)[number]

/**
 * Protected transition tables (flow.md §67.1).
 * Any transition not listed here is rejected programmatically.
 */
const PROPOSAL_TRANSITIONS: Record<ProposalState, ProposalState[]> = {
  proposed: ['fact_validated', 'needs_user_input', 'user_editing', 'rejected', 'cancelled'],
  needs_user_input: ['user_editing', 'proposed', 'rejected', 'cancelled'],
  fact_validated: ['waiting_for_approval', 'user_editing', 'rejected', 'cancelled'],
  waiting_for_approval: ['approved', 'content_changed', 'rejected', 'cancelled'],
  approved: ['ready_to_execute', 'content_changed'],
  ready_to_execute: ['content_changed', 'failed'],
  content_changed: ['proposed', 'fact_validated', 'needs_user_input'],
  user_editing: ['proposed', 'fact_validated', 'cancelled'],
  rejected: [],
  cancelled: [],
  failed: ['user_editing', 'rejected', 'cancelled'],
}

const ACTION_TRANSITIONS: Record<ActionState, ActionState[]> = {
  approved: ['executing', 'cancelled', 'skipped', 'paused'],
  executing: ['verifying', 'failed'],
  verifying: ['completed', 'unverified', 'failed'],
  completed: [],
  failed: ['approved'],
  paused: ['approved', 'cancelled', 'skipped'],
  skipped: [],
  cancelled: [],
  unverified: ['approved', 'cancelled'],
  rejected: [],
}

const POST_TRANSITIONS: Record<PostState, PostState[]> = {
  idea: ['draft', 'cancelled'],
  draft: ['ai_review', 'final_draft', 'user_editing', 'cancelled'],
  ai_review: ['blocked_fact_check', 'final_draft', 'user_editing', 'cancelled'],
  user_editing: ['ai_review', 'final_draft', 'draft', 'blocked_fact_check', 'cancelled'],
  blocked_fact_check: ['user_editing', 'cancelled'],
  final_draft: ['waiting_approval', 'user_editing', 'cancelled'],
  waiting_approval: ['approved', 'final_draft', 'user_editing', 'cancelled'],
  approved: ['publish_confirmed', 'cancelled'],
  publish_confirmed: ['publishing', 'cancelled'],
  publishing: ['published', 'unverified', 'blocked_fact_check'],
  published: [],
  unverified: ['publish_confirmed', 'cancelled'],
  cancelled: [],
}

function assertKnown<T extends string>(table: Record<string, T[]>, from: T, kind: string): void {
  if (!(from in table)) {
    throw new ApiError(409, 'EXECUTION_ERROR', `unknown ${kind} state "${from}"`)
  }
}

export function assertProposalTransition(from: ProposalState, to: ProposalState): void {
  assertKnown(PROPOSAL_TRANSITIONS as Record<string, ProposalState[]>, from, 'proposal')
  if (!PROPOSAL_TRANSITIONS[from].includes(to)) {
    throw new ApiError(
      409,
      'EXECUTION_ERROR',
      `invalid proposal transition ${from} -> ${to} (protected state guard)`,
    )
  }
}

export function assertActionTransition(from: ActionState, to: ActionState): void {
  assertKnown(ACTION_TRANSITIONS as Record<string, ActionState[]>, from, 'action')
  if (!ACTION_TRANSITIONS[from].includes(to)) {
    throw new ApiError(
      409,
      'EXECUTION_ERROR',
      `invalid action transition ${from} -> ${to} (protected state guard)`,
    )
  }
}

export function assertPostTransition(from: PostState, to: PostState): void {
  assertKnown(POST_TRANSITIONS as Record<string, PostState[]>, from, 'post')
  if (!POST_TRANSITIONS[from].includes(to)) {
    throw new ApiError(
      409,
      'EXECUTION_ERROR',
      `invalid post transition ${from} -> ${to} (protected state guard)`,
    )
  }
}
