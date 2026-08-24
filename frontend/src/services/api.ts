const TOKEN_KEY = 'linkedin-agent-session-token'

export interface SessionUser {
  id: string
  email: string
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class UnauthorizedError extends Error {
  constructor() {
    super('session expired or missing')
    this.name = 'UnauthorizedError'
  }
}

export interface ApiErrorPayload {
  error: string
  message?: string
  issues?: Array<{ path: Array<string | number>; message: string }>
}

/**
 * Every request carries ONLY the verified session token (flow.md §63). Identity is
 * never asserted by the client; the backend resolves it from the session store.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
  if (init?.body !== undefined) headers['content-type'] = 'application/json'
  const token = getStoredToken()
  if (token) headers['authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...init, headers })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) {
    if (res.status === 401) clearToken()
    const errPayload = payload as ApiErrorPayload | null
    if (res.status === 401) throw new UnauthorizedError()
    const detail =
      errPayload?.issues?.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; ') ??
      ''
    throw new Error(
      `${errPayload?.error ?? 'REQUEST_FAILED'}${detail ? ` — ${detail}` : ''}${
        errPayload?.message && !detail ? ` — ${errPayload.message}` : ''
      }`,
    )
  }
  return payload as T
}
