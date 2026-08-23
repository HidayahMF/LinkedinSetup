import { apiFetch } from './api'
import type { Profile, ProfileVersion, FieldDiff } from '../types/profile'

export interface ProfileUpdatePayload {
  headline?: string
  about?: string
  experiences?: Profile['experiences']
  educations?: Profile['educations']
  projects?: Profile['projects']
  skills?: Profile['skills']
  certifications?: Profile['certifications']
  featured?: Profile['featured']
}

export interface ReviewResponse {
  target: string
  strengths: string[]
  issues: string[]
  unsupportedClaims: string[]
  missingInformation: string[]
  recommendations: string[]
  optionalImprovements: string[]
  scores: Record<string, number>
  overall: number
}

export const profileService = {
  get(): Promise<{ profile: Profile }> {
    return apiFetch('/api/profile')
  },
  update(payload: ProfileUpdatePayload): Promise<{
    profile: Profile
    versionNumber: number
    changes: FieldDiff[]
  }> {
    return apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify(payload) })
  },
  review(target: 'profile' | string): Promise<{ review: ReviewResponse }> {
    return apiFetch('/api/profile/review', { method: 'POST', body: JSON.stringify({ target }) })
  },
  improve(target: string, itemId?: string): Promise<{ proposal: unknown }> {
    return apiFetch('/api/profile/improve', {
      method: 'POST',
      body: JSON.stringify(itemId ? { target, itemId } : { target }),
    })
  },
}

export const versionsService = {
  list(): Promise<{ versions: ProfileVersion[] }> {
    return apiFetch('/api/profile/versions')
  },
  diff(from: string, to: string): Promise<{ changes: FieldDiff[] }> {
    const qs = new URLSearchParams({ from, to }).toString()
    return apiFetch(`/api/profile/versions/diff?${qs}`)
  },
  restore(
    id: string,
  ): Promise<{ restoredFromVersion: number; newVersion: ProfileVersion }> {
    return apiFetch(`/api/profile/versions/${id}/restore`, { method: 'POST' })
  },
}
