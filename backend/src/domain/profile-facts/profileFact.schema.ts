import { z } from 'zod'
import {
  FACT_CATEGORIES,
  FACT_SOURCES,
  FACT_STATUSES,
  FACT_TYPES,
  isAuthoritativeType,
} from './profileFact.types.js'

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid 24-char hex id')

const jsonValueSchema: z.ZodType<unknown> = z.union([
  z
    .string()
    .refine((v) => v.trim().length > 0, 'value must not be empty or whitespace'),
  z.number().finite(),
  z.boolean(),
  z
    .array(z.unknown())
    .refine((v) => v.length > 0, 'value must not be an empty array'),
  z
    .record(z.string(), z.unknown())
    .refine((v) => Object.keys(v).length > 0, 'value must not be an empty object'),
])

export const createProfileFactSchema = z
  .object({
    type: z.enum(FACT_TYPES),
    category: z.enum(FACT_CATEGORIES),
    key: z.string().trim().min(1, 'key is required').max(120),
    value: jsonValueSchema,
    status: z.enum(FACT_STATUSES),
    source: z.enum(FACT_SOURCES),
    sourceReference: z.string().trim().min(1).max(500).nullish(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!isAuthoritativeType(data.type) && data.status === 'verified') {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: `type "${data.type}" cannot be stored as verified; only the user can explicitly confirm it as a verified fact`,
      })
    }
  })

export type CreateProfileFactInput = z.infer<typeof createProfileFactSchema>

export const updateProfileFactSchema = z
  .object({
    type: z.enum(FACT_TYPES).optional(),
    category: z.enum(FACT_CATEGORIES).optional(),
    key: z.string().trim().min(1).max(120).optional(),
    value: jsonValueSchema.optional(),
    status: z.enum(FACT_STATUSES).optional(),
    source: z.enum(FACT_SOURCES).optional(),
    sourceReference: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'update payload must contain at least one field',
  })

export type UpdateProfileFactInput = z.infer<typeof updateProfileFactSchema>

export const listProfileFactsQuerySchema = z
  .object({
    type: z.enum(FACT_TYPES).optional(),
    category: z.enum(FACT_CATEGORIES).optional(),
    status: z.enum(FACT_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()

export type ListProfileFactsQuery = z.infer<typeof listProfileFactsQuerySchema>
