import { z } from 'zod'
import type { RiskLevel } from '../domain/approval/approval.model.js'

export const ACTION_TYPES = [
  'update_headline',
  'update_about',
  'add_experience',
  'edit_experience',
  'add_education',
  'edit_education',
  'add_project',
  'edit_project',
  'add_skill',
  'remove_skill',
  'add_certification',
  'add_featured',
  'create_post_draft_on_linkedin',
  'publish_post',
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

/** flow.md §46.1 — risk classification determines approval requirements. */
export const RISK_MATRIX: Record<ActionType, RiskLevel> = {
  update_headline: 'medium',
  update_about: 'medium',
  add_experience: 'high',
  edit_experience: 'high',
  add_education: 'high',
  edit_education: 'high',
  add_project: 'medium',
  edit_project: 'medium',
  add_skill: 'medium',
  remove_skill: 'high',
  add_certification: 'medium',
  add_featured: 'medium',
  create_post_draft_on_linkedin: 'medium',
  publish_post: 'critical',
}

const isoDateish = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$/)
  .nullish()

export const ACTION_PAYLOAD_SCHEMAS = {
  update_headline: z
    .object({ headline: z.string().trim().min(1).max(220) })
    .strict(),
  update_about: z
    .object({ about: z.string().trim().min(1).max(6000) })
    .strict(),
  add_experience: z
    .object({
      company: z.string().trim().min(1).max(200),
      role: z.string().trim().min(1).max(200),
      employmentType: z.string().trim().max(80).nullish(),
      location: z.string().trim().max(200).nullish(),
      startDate: isoDateish,
      endDate: isoDateish,
      current: z.boolean().optional(),
      description: z.string().trim().max(3000).nullish(),
    })
    .strict(),
  edit_experience: z
    .object({
      itemId: z.string().trim().min(1).max(64),
      company: z.string().trim().min(1).max(200),
      role: z.string().trim().min(1).max(200),
      description: z.string().trim().max(3000).nullish(),
    })
    .strict(),
  add_education: z
    .object({
      school: z.string().trim().min(1).max(200),
      degree: z.string().trim().max(200).nullish(),
      field: z.string().trim().max(200).nullish(),
      startDate: isoDateish,
      endDate: isoDateish,
      description: z.string().trim().max(3000).nullish(),
    })
    .strict(),
  edit_education: z
    .object({
      itemId: z.string().trim().min(1).max(64),
      school: z.string().trim().min(1).max(200),
      degree: z.string().trim().max(200).nullish(),
      description: z.string().trim().max(3000).nullish(),
    })
    .strict(),
  add_project: z
    .object({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(3000).nullish(),
      role: z.string().trim().max(200).nullish(),
      technologies: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
      url: z.string().trim().url().max(500).nullish(),
      startDate: isoDateish,
      endDate: isoDateish,
    })
    .strict(),
  edit_project: z
    .object({
      itemId: z.string().trim().min(1).max(64),
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(3000).nullish(),
    })
    .strict(),
  add_skill: z
    .object({ name: z.string().trim().min(1).max(120) })
    .strict(),
  remove_skill: z
    .object({ name: z.string().trim().min(1).max(120) })
    .strict(),
  add_certification: z
    .object({
      name: z.string().trim().min(1).max(200),
      issuer: z.string().trim().max(200).nullish(),
      issueDate: isoDateish,
      expiryDate: isoDateish,
    })
    .strict(),
  add_featured: z
    .object({
      title: z.string().trim().min(1).max(200),
      type: z.string().trim().max(80).nullish(),
      url: z.string().trim().url().max(500).nullish(),
      description: z.string().trim().max(1000).nullish(),
    })
    .strict(),
  create_post_draft_on_linkedin: z
    .object({ text: z.string().trim().min(1).max(3000), postId: z.string().trim().min(1).max(64) })
    .strict(),
  publish_post: z
    .object({ text: z.string().trim().min(1).max(3000), postId: z.string().trim().min(1).max(64) })
    .strict(),
} as const satisfies Record<ActionType, z.ZodTypeAny>

export function validateActionPayload(
  actionType: ActionType,
  payload: unknown,
): Record<string, unknown> {
  const schema = ACTION_PAYLOAD_SCHEMAS[actionType]
  if (!schema) throw new Error(`no payload schema for action ${actionType}`)
  return schema.parse(payload) as Record<string, unknown>
}

export interface PlannedActionDraft {
  actionId: string
  actionType: ActionType
  riskLevel: RiskLevel
  targetField: string
  summary: string
  payload: Record<string, unknown>
}
