import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { connectMongo, disconnectMongo, mongoConnectionState } from '../src/database/mongo.js'
import { ProfileFactModel } from '../src/domain/profile-facts/profileFact.model.js'
import { AuditEventModel } from '../src/audit/audit.model.js'

let mongo: MongoMemoryServer
let server: Server
let baseUrl: string

/**
 * Real authentication (flow.md §62/§71): accounts are registered through the auth
 * API and every request carries a verified Bearer session token. These constants
 * hold the server-assigned account ids resolved to tokens by call().
 */
let userA = ''
let userB = ''

const tokens = new Map<string, string>()

async function registerAccount(tag: string, assignTo: (id: string) => void): Promise<void> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${tag}@facts.test`, password: 'profile-facts-pass-1' }),
  })
  if (res.status !== 201) throw new Error(`register ${tag} failed: ${res.status}`)
  const payload = (await res.json()) as { user: { id: string }; token: string }
  tokens.set(payload.user.id, payload.token)
  assignTo(payload.user.id)
}

const validCreate = {
  type: 'fact',
  category: 'skill',
  key: 'TypeScript',
  value: 'Used in LifeHub frontend and backend tooling',
  status: 'verified',
  source: 'user_profile',
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await connectMongo(mongo.getUri('linkedin_ai_agent_test'), 'linkedin_ai_agent_test')
  expect(mongoConnectionState()).toBe('connected')
  await new Promise<void>((resolve) => {
    server = createServer(createApp())
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
  await registerAccount('facts-user-a', (id) => (userA = id))
  await registerAccount('facts-user-b', (id) => (userB = id))
})

afterAll(async () => {
  server.close()
  await disconnectMongo()
  await mongo.stop()
})

afterEach(async () => {
  await ProfileFactModel.deleteMany({})
  await AuditEventModel.deleteMany({})
})

interface RequestOptions {
  method?: string
  body?: unknown
  user?: string
  /** Overrides the cached token — used to prove garbage tokens are rejected. */
  tokenOverride?: string
}

async function call(
  path: string,
  { method = 'GET', body, user, tokenOverride }: RequestOptions = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {}
  if (tokenOverride !== undefined) {
    headers['authorization'] = `Bearer ${tokenOverride}`
  } else if (user !== undefined) {
    const token = tokens.get(user)
    if (!token) throw new Error(`no live session token for test user ${user}`)
    headers['authorization'] = `Bearer ${token}`
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function createFactAs(user: string, overrides: Record<string, unknown> = {}) {
  const { status, body } = await call('/api/profile-facts', {
    method: 'POST',
    user,
    body: { ...validCreate, ...overrides },
  })
  expect(status).toBe(201)
  return body.fact as { id: string; userId: string; [k: string]: unknown }
}

describe('profile facts — ownership', () => {
  it('creates a fact owned by the authenticated user', async () => {
    const fact = await createFactAs(userA)
    expect(fact.userId).toBe(userA)
    expect(fact.key).toBe(validCreate.key)
    expect(fact.id).toMatch(/^[0-9a-f]{24}$/i)
  })

  it('lists only facts owned by the authenticated user', async () => {
    await createFactAs(userA, { key: 'fact-A' })
    await createFactAs(userB, { key: 'fact-B' })
    const { status, body } = await call('/api/profile-facts', { user: userA })
    expect(status).toBe(200)
    expect(body.facts).toHaveLength(1)
    expect(body.facts[0].key).toBe('fact-A')
    expect(body.facts[0].userId).toBe(userA)
  })

  it('cannot read another user’s fact (404, no existence leak)', async () => {
    const factOfB = await createFactAs(userB)
    const { status, body } = await call(`/api/profile-facts/${factOfB.id}`, { user: userA })
    expect(status).toBe(404)
    expect(body.error).toBe('NOT_FOUND')
  })

  it('cannot update another user’s fact (404)', async () => {
    const factOfB = await createFactAs(userB)
    const { status } = await call(`/api/profile-facts/${factOfB.id}`, {
      method: 'PATCH',
      user: userA,
      body: { value: 'hijacked' },
    })
    expect(status).toBe(404)
    const check = await call(`/api/profile-facts/${factOfB.id}`, { user: userB })
    expect(check.body.fact.value).toBe(validCreate.value)
  })

  it('cannot delete another user’s fact (404)', async () => {
    const factOfB = await createFactAs(userB)
    const { status } = await call(`/api/profile-facts/${factOfB.id}`, {
      method: 'DELETE',
      user: userA,
    })
    expect(status).toBe(404)
    const check = await call(`/api/profile-facts/${factOfB.id}`, { user: userB })
    expect(check.status).toBe(200)
  })

  it('userId in request body cannot take over ownership', async () => {
    const { status, body } = await call('/api/profile-facts', {
      method: 'POST',
      user: userA,
      body: { ...validCreate, userId: userB },
    })
    if (status === 201) {
      expect(body.fact.userId).toBe(userA)
    } else {
      expect(status).toBe(400)
      expect(body.error).toBe('VALIDATION_ERROR')
      expect(body.fact ?? null).toBeNull()
    }
    const list = await call('/api/profile-facts', { user: userB })
    expect(list.body.facts).toHaveLength(0)
  })

  it('updates only resources owned by the authenticated user', async () => {
    const fact = await createFactAs(userA)
    const { status, body } = await call(`/api/profile-facts/${fact.id}`, {
      method: 'PATCH',
      user: userA,
      body: { value: 'Updated by owner', status: 'needs_confirmation' },
    })
    expect(status).toBe(200)
    expect(body.fact.value).toBe('Updated by owner')
    expect(body.fact.status).toBe('needs_confirmation')
  })

  it('deletes only resources owned by the authenticated user', async () => {
    const fact = await createFactAs(userA)
    const del = await call(`/api/profile-facts/${fact.id}`, {
      method: 'DELETE',
      user: userA,
    })
    expect(del.status).toBe(204)
    const gone = await call(`/api/profile-facts/${fact.id}`, { user: userA })
    expect(gone.status).toBe(404)
  })
})

describe('profile facts — authentication boundary', () => {
  it('rejects requests without authenticated context (401)', async () => {
    const { status, body } = await call('/api/profile-facts')
    expect(status).toBe(401)
    expect(body.error).toBe('AUTHENTICATION_ERROR')
  })

  it('rejects unauthenticated requests (401) — no header or session can assert identity', async () => {
    const noAuth = await fetch(`${baseUrl}/api/profile-facts`)
    expect(noAuth.status).toBe(401)
    const forgedHeader = await fetch(`${baseUrl}/api/profile-facts`, {
      headers: { 'x-user-id': 'not-an-objectid' },
    })
    expect(forgedHeader.status).toBe(401)
    const garbageToken = await call('/api/profile-facts', { user: userA, tokenOverride: 'garbage' })
    expect(garbageToken.status).toBe(401)
  })
})

describe('profile facts — validation boundary', () => {
  it('rejects invalid zod payloads with VALIDATION_ERROR (400)', async () => {
    const { status, body } = await call('/api/profile-facts', {
      method: 'POST',
      user: userA,
      body: { key: 'incomplete' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it('rejects invalid taxonomy values (400)', async () => {
    const { status } = await call('/api/profile-facts', {
      method: 'POST',
      user: userA,
      body: { ...validCreate, category: 'hobbies' },
    })
    expect(status).toBe(400)
  })

  it('rejects malformed ids with 400 instead of leaking internals', async () => {
    const { status, body } = await call('/api/profile-facts/not-a-valid-id', {
      user: userA,
    })
    expect(status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(JSON.stringify(body)).not.toMatch(/Cast to ObjectId/i)
  })

  it('rejects patch that would set generated positioning to verified (400)', async () => {
    const fact = await createFactAs(userA, {
      type: 'generated_positioning',
      key: 'headline',
      value: 'Full-Stack Developer',
      status: 'needs_confirmation',
      source: 'project_data',
    })
    const { status, body } = await call(`/api/profile-facts/${fact.id}`, {
      method: 'PATCH',
      user: userA,
      body: { status: 'verified' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
  })
})

describe('profile facts — source of truth rules (flow.md §3.1 / §5 / §6)', () => {
  it('never stores GENERATED_POSITIONING as a verified fact', async () => {
    const { status } = await call('/api/profile-facts', {
      method: 'POST',
      user: userA,
      body: {
        ...validCreate,
        type: 'generated_positioning',
        key: 'headline',
        value: 'Full-Stack Developer',
        status: 'verified',
      },
    })
    expect(status).toBe(400)
    const all = await call('/api/profile-facts', { user: userA })
    expect(all.body.facts).toHaveLength(0)
  })

  it('never stores INFERENCE as a verified fact', async () => {
    const { status } = await call('/api/profile-facts', {
      method: 'POST',
      user: userA,
      body: {
        ...validCreate,
        type: 'inference',
        key: 'implied_skill',
        value: 'Angular experience suggests frontend experience',
        status: 'verified',
      },
    })
    expect(status).toBe(400)
  })

  it('stores GENERATED_POSITIONING only as non-verified until explicit confirmation', async () => {
    const { status, body } = await call('/api/profile-facts', {
      method: 'POST',
      user: userA,
      body: {
        type: 'generated_positioning',
        category: 'identity',
        key: 'headline',
        value: 'Full-Stack Developer',
        status: 'needs_confirmation',
        source: 'project_data',
      },
    })
    expect(status).toBe(201)
    expect(body.fact.status).toBe('needs_confirmation')
    expect(body.fact.type).toBe('generated_positioning')
  })

  it('does not fill missing information with assumptions', async () => {
    for (const bad of ['', '   ', null]) {
      const { status } = await call('/api/profile-facts', {
        method: 'POST',
        user: userA,
        body: { ...validCreate, value: bad },
      })
      expect(status).toBe(400)
    }
    const patch = await call(`/api/profile-facts/x`, { method: 'PATCH', user: userA, body: {} })
    expect(patch.status).toBe(400)
    const all = await call('/api/profile-facts', { user: userA })
    expect(all.body.facts).toHaveLength(0)
  })

  it('persists UNKNOWN / NEEDS_CONFIRMATION statuses exactly as provided, without guessing', async () => {
    const needs = await createFactAs(userA, {
      key: 'company_period',
      value: 'PT Braja Mukti Cakra',
      status: 'needs_confirmation',
      source: 'other_confirmed',
    })
    expect(needs.status).toBe('needs_confirmation')
    const unknown = await createFactAs(userA, {
      key: 'team_size',
      value: 'not provided yet',
      status: 'unknown',
      source: 'user_profile',
    })
    expect(unknown.status).toBe('unknown')
    expect(unknown.value).toBe('not provided yet')
    const dontuse = await createFactAs(userA, { status: 'do_not_use', key: 'old_role' })
    expect(dontuse.status).toBe('do_not_use')
  })
})

describe('audit trail (flow.md §57 — append-only)', () => {
  it('records created, updated, deleted events with before/after', async () => {
    const fact = await createFactAs(userA)
    await call(`/api/profile-facts/${fact.id}`, {
      method: 'PATCH',
      user: userA,
      body: { value: 'changed by owner' },
    })
    await call(`/api/profile-facts/${fact.id}`, { method: 'DELETE', user: userA })

    const events = (await AuditEventModel.find({ userId: userA })
      .sort({ timestamp: 1 })
      .lean()) as Array<Record<string, any>>
    const types = events.map((e) => e.actionType)
    expect(types).toEqual(['profile_fact.created', 'profile_fact.updated', 'profile_fact.deleted'])
    expect(events[0].after.value).toBe(validCreate.value)
    expect(events[1].before.value).toBe(validCreate.value)
    expect(events[1].after.value).toBe('changed by owner')

    const crossUser = await AuditEventModel.find({ userId: userB }).lean()
    expect(crossUser).toHaveLength(0)
  })

  it('audit module exposes no mutation APIs (append-only contract)', () => {
    const servicePath = join(process.cwd(), 'src', 'audit', 'audit.service.ts')
    const source = readFileSync(servicePath, 'utf8')
    expect(source).toMatch(/export async function appendAuditEvent/)
    expect(source).not.toMatch(
      /deleteOne|deleteMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate/,
    )
  })
})

describe('repository ownership scope (static contract)', () => {
  it('every repository export is ownership-scoped', () => {
    const repoPath = join(
      process.cwd(),
      'src',
      'domain',
      'profile-facts',
      'profileFact.repository.ts',
    )
    const source = readFileSync(repoPath, 'utf8')
    const exportedFns = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1])
    expect(exportedFns.length).toBeGreaterThan(0)
    for (const fn of exportedFns) {
      expect(fn, `repository export ${fn} must be ownership-scoped`).toMatch(
        /(ForOwner|ByOwner)$/,
      )
    }
    const ownershipFilters = source.match(/userId: toObjectId\(userId\)/g) ?? []
    expect(ownershipFilters.length).toBeGreaterThanOrEqual(4)
  })
})
