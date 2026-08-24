import { apiFetch, clearToken, storeToken, type SessionUser } from './api'

interface AuthResponse {
  user: SessionUser
  token: string
  expiresAt: string
}

export async function register(email: string, password: string): Promise<SessionUser> {
  const res = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  storeToken(res.token)
  return res.user
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  storeToken(res.token)
  return res.user
}

export async function me(): Promise<SessionUser | null> {
  try {
    const res = await apiFetch<{ user: SessionUser }>('/api/auth/me')
    return res.user
  } catch {
    clearToken()
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' })
  } finally {
    clearToken()
  }
}
