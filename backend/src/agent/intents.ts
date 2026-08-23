import { PROFILE_SECTIONS, type ProfileSectionName } from '../domain/profile/profile.types.js'

export const AGENT_INTENTS = [
  'setup_profile',
  'review_profile',
  'review_section',
  'improve_section',
  'add_project',
  'add_skill',
  'create_post_draft',
  'publish_post_request',
  'unknown',
] as const

export type AgentIntent = (typeof AGENT_INTENTS)[number]

const SECTION_KEYWORDS: Array<{ section: ProfileSectionName; patterns: RegExp }> = [
  { section: 'headline', patterns: /\bheadline\b|\bjudul\b/i },
  { section: 'about', patterns: /\babout\b|\btentang saya\b|\bsummary\b/i },
  { section: 'experiences', patterns: /\bexperience\b|\bpengalaman\b/i },
  { section: 'educations', patterns: /\beducation\b|\bpendidikan\b|\bsekolah\b|\bkuliah\b/i },
  { section: 'projects', patterns: /\bproject\b|\bprojects\b|\bproyek\b/i },
  { section: 'skills', patterns: /\bskill\b|\bskills\b|\bkeahlian\b/i },
  { section: 'certifications', patterns: /\bcertification\b|\bsertifikasi\b/i },
  { section: 'featured', patterns: /\bfeatured\b|\bunggulan\b/i },
]

export function detectSection(command: string): ProfileSectionName | null {
  for (const entry of SECTION_KEYWORDS) {
    if (entry.patterns.test(command)) return entry.section
  }
  return null
}

/** Natural language is the INTERFACE — detection here never authorizes execution (flow.md §45.2). */
export function detectIntent(command: string): { intent: AgentIntent; section: ProfileSectionName | null } {
  const c = command.toLowerCase()
  const section = detectSection(command)

  if (/\bsetup\b|\bsusun\b|\blengkapi\b|\brapikan profil\b/.test(c)) {
    return { intent: 'setup_profile', section }
  }
  if (/\bpublish\b|\bpublikasikan\b|\bposting sekarang\b|\bpost sekarang\b/.test(c)) {
    return { intent: 'publish_post_request', section }
  }
  if (/\bbuat post\b|\bbuat postingan\b|\bdraft post\b|\bpost tentang\b|\bpostingan tentang\b/.test(c)) {
    return { intent: 'create_post_draft', section }
  }
  if (/\bimprove\b|\bperbaiki\b|\bperbagus\b|\boptimasi\b|\btulis ulang\b/.test(c)) {
    return { intent: 'improve_section', section }
  }
  if (/\breview\b|\bcek\b|\bcheck\b|\baudit\b|\breviu\b/.test(c)) {
    return { intent: section ? 'review_section' : 'review_profile', section }
  }
  if (/\btambah project\b|\badd project\b|\btambah proyek\b/.test(c)) {
    return { intent: 'add_project', section: 'projects' }
  }
  if (/\btambah skill\b|\badd skill\b|\btambah keahlian\b/.test(c)) {
    return { intent: 'add_skill', section: 'skills' }
  }
  if (section && /(^|\s)(headline|about|experience|education|project|skill)/.test(c)) {
    return { intent: 'improve_section', section }
  }
  return { intent: 'unknown', section }
}

export const ALL_SECTIONS = PROFILE_SECTIONS

export function projectQuestions(): string[] {
  return [
    'Project name:',
    'Your role in the project:',
    'Description (what it actually does):',
    'Technologies used:',
    'URL (optional):',
    'Start date (YYYY or YYYY-MM, optional):',
    'End date (optional):',
    'Highlights (only facts you can confirm):',
  ]
}

export function skillQuestions(): string[] {
  return [
    'Which skill do you want to add? I will only recommend skills backed by your verified facts.',
  ]
}
