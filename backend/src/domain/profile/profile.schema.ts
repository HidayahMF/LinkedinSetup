import { z } from 'zod'
import { PROFILE_SECTIONS } from './profile.types.js'

const shortText = z.string().trim().min(1).max(200)
const longText = z.string().trim().max(3000)
const aboutText = z.string().trim().max(6000)
const optionalShort = z.string().trim().max(200).nullish()
const isoDateish = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$/, 'must look like YYYY, YYYY-MM or YYYY-MM-DD')
  .nullish()

const experienceSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    company: shortText,
    role: shortText,
    employmentType: optionalShort,
    location: optionalShort,
    startDate: isoDateish,
    endDate: isoDateish,
    current: z.boolean().optional(),
    description: longText.nullish(),
    technologies: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  })
  .strict()

const educationSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    school: shortText,
    degree: optionalShort,
    field: optionalShort,
    startDate: isoDateish,
    endDate: isoDateish,
    description: longText.nullish(),
  })
  .strict()

const projectSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: shortText,
    description: aboutText.nullish(),
    role: optionalShort,
    technologies: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    url: z.string().trim().url().max(500).nullish(),
    startDate: isoDateish,
    endDate: isoDateish,
    highlights: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .strict()

const certificationSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: shortText,
    issuer: optionalShort,
    issueDate: isoDateish,
    expiryDate: isoDateish,
    credentialUrl: z.string().trim().url().max(500).nullish(),
  })
  .strict()

const featuredSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    title: shortText,
    type: optionalShort,
    url: z.string().trim().url().max(500).nullish(),
    description: longText.nullish(),
  })
  .strict()

const skillSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
  })
  .strict()

export const profileUpdateSchema = z
  .object({
    headline: z.string().trim().max(220).optional(),
    about: aboutText.optional(),
    experiences: z.array(experienceSchema).max(50).optional(),
    educations: z.array(educationSchema).max(50).optional(),
    projects: z.array(projectSchema).max(100).optional(),
    skills: z.array(skillSchema).max(100).optional(),
    certifications: z.array(certificationSchema).max(100).optional(),
    featured: z.array(featuredSchema).max(50).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'update payload must contain at least one section',
  })

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

export const reviewRequestSchema = z
  .object({
    target: z.enum(['profile', ...PROFILE_SECTIONS]).default('profile'),
  })
  .strict()

export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>

export const improveRequestSchema = z
  .object({
    target: z.enum(PROFILE_SECTIONS),
    itemId: z.string().trim().max(64).optional(),
    instructions: z.string().trim().max(2000).optional(),
  })
  .strict()

export type ImproveRequestInput = z.infer<typeof improveRequestSchema>
