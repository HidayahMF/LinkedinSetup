import { apiFetch } from './api'
import type {
  FactCategory,
  FactSource,
  FactStatus,
  FactType,
  ProfileFact,
} from '../types/profileFact'

export interface CreateProfileFactPayload {
  type: FactType
  category: FactCategory
  key: string
  value: string
  status: FactStatus
  source: FactSource
  sourceReference?: string
}

export interface UpdateProfileFactPayload {
  value?: string
  status?: FactStatus
}

export const profileFactsService = {
  list(): Promise<{ facts: ProfileFact[] }> {
    return apiFetch('/api/profile-facts')
  },
  create(payload: CreateProfileFactPayload): Promise<{ fact: ProfileFact }> {
    return apiFetch('/api/profile-facts', { method: 'POST', body: JSON.stringify(payload) })
  },
  update(id: string, patch: UpdateProfileFactPayload): Promise<{ fact: ProfileFact }> {
    return apiFetch(`/api/profile-facts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id: string): Promise<void> {
    return apiFetch(`/api/profile-facts/${id}`, { method: 'DELETE' })
  },
}
