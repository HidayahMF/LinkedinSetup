export const PROFILE_SECTIONS = [
  'headline',
  'about',
  'experiences',
  'educations',
  'projects',
  'skills',
  'certifications',
  'featured',
] as const

export type ProfileSectionName = (typeof PROFILE_SECTIONS)[number]

export interface ExperienceItem {
  id: string
  company: string
  role: string
  employmentType?: string | null
  location?: string | null
  startDate?: string | null
  endDate?: string | null
  current?: boolean
  description?: string | null
  technologies?: string[]
}

export interface EducationItem {
  id: string
  school: string
  degree?: string | null
  field?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
}

export interface ProjectItem {
  id: string
  name: string
  description?: string | null
  role?: string | null
  technologies?: string[]
  url?: string | null
  startDate?: string | null
  endDate?: string | null
  highlights?: string[]
}

export interface CertificationItem {
  id: string
  name: string
  issuer?: string | null
  issueDate?: string | null
  expiryDate?: string | null
  credentialUrl?: string | null
}

export interface FeaturedItem {
  id: string
  title: string
  type?: string | null
  url?: string | null
  description?: string | null
}

export interface SkillItem {
  id: string
  name: string
}

export interface ProfileSnapshot {
  headline: string
  about: string
  experiences: ExperienceItem[]
  educations: EducationItem[]
  projects: ProjectItem[]
  skills: SkillItem[]
  certifications: CertificationItem[]
  featured: FeaturedItem[]
}

export interface ProfileDTO extends ProfileSnapshot {
  userId: string
  createdAt: string
  updatedAt: string
}

export const EMPTY_PROFILE_SNAPSHOT: ProfileSnapshot = {
  headline: '',
  about: '',
  experiences: [],
  educations: [],
  projects: [],
  skills: [],
  certifications: [],
  featured: [],
}
