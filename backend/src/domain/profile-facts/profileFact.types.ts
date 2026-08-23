export const FACT_TYPES = [
  'fact',
  'inference',
  'generated_content',
  'generated_positioning',
  'user_authored_content',
] as const

export type FactType = (typeof FACT_TYPES)[number]

export const FACT_CATEGORIES = [
  'identity',
  'experience',
  'education',
  'project',
  'skill',
  'achievement',
  'certification',
] as const

export type FactCategory = (typeof FACT_CATEGORIES)[number]

export const FACT_STATUSES = [
  'verified',
  'needs_confirmation',
  'unknown',
  'do_not_use',
] as const

export type FactStatus = (typeof FACT_STATUSES)[number]

export const FACT_SOURCES = [
  'user_profile',
  'user_document',
  'user_confirmation',
  'project_data',
  'linkedin_data',
  'other_confirmed',
  'user_confirmed_identity',
] as const

export type FactSource = (typeof FACT_SOURCES)[number]

export const AUTHORITATIVE_TYPES: readonly FactType[] = ['fact', 'user_authored_content']

export function isAuthoritativeType(type: FactType): boolean {
  return AUTHORITATIVE_TYPES.includes(type)
}

export interface ProfileFactDTO {
  id: string
  userId: string
  type: FactType
  category: FactCategory
  key: string
  value: unknown
  status: FactStatus
  source: FactSource
  sourceReference?: string | null
  createdAt: string
  updatedAt: string
}
