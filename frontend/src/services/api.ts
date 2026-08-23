const USER_ID_KEY = 'linkedin-agent-user-id'

/** Dev identity: a valid ObjectId identifying this browser's workspace user. */
export const DEFAULT_USER_ID = '64b7f0a1c9e2d3f4a5b6c7d8'

export function getCurrentUserId(): string {
  const stored = localStorage.getItem(USER_ID_KEY)
  return stored ?? DEFAULT_USER_ID
}

export function setCurrentUserId(id: string): void {
  localStorage.setItem(USER_ID_KEY, id)
}

export interface ApiErrorPayload {
  error: string
  message?: string
  issues?: Array<{ path: Array<string | number>; message: string }>
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      'x-user-id': getCurrentUserId(),
      ...init?.headers,
    },
  })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) {
    const errPayload = payload as ApiErrorPayload | null
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
