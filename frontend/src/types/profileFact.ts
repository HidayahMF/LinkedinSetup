export const FACT_TYPES = [
  'fact',
  'inference',
  'generated_content',
  'generated_positioning',
  'user_authored_content',
] as const

export const FACT_CATEGORIES = [
  'identity',
  'experience',
  'education',
  'project',
  'skill',
  'achievement',
  'certification',
] as const

export const FACT_STATUSES = [
  'verified',
  'needs_confirmation',
  'unknown',
  'do_not_use',
] as const

export const FACT_SOURCES = [
  'user_profile',
  'user_document',
  'user_confirmation',
  'project_data',
  'linkedin_data',
  'other_confirmed',
  'user_confirmed_identity',
] as const

export type FactType = (typeof FACT_TYPES)[number]
export type FactCategory = (typeof FACT_CATEGORIES)[number]
export type FactStatus = (typeof FACT_STATUSES)[number]
export type FactSource = (typeof FACT_SOURCES)[number]

export interface ProfileFact {
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
