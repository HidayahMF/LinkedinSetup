/**
 * PHASE C — PRE-EXECUTOR SECURITY HARDENING REGRESSION SUITE
 *
 * The executor under test here is the honest SimulationProvider (results =
 * UNVERIFIED): fixtures/simEnv.js pins AUTOMATION_PROVIDER=simulation so the
 * suite stays deterministic regardless of any local .env. That lets C-18…C-20
 * prove the execution contract holds without any automation backend.
 */
import './fixtures/simEnv.js'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { connectMongo, disconnectMongo } from '../src/database/mongo.js'
import { resetRateLimits } from '../src/security/rateLimit.js'
import { redactSecrets } from '../src/security/redact.js'
import { AuthSessionModel } from '../src/domain/auth/authSession.model.js'
import { AuditEventModel } from '../src/audit/audit.model.js'
import { LinkedInActionModel } from '../src/execution/actions/action.model.js'

let mongo: MongoMemoryServer
let server: Server
let baseUrl: string

const PASSWORD = 'phase-c-hardening-pass'

let userA = ''
let tokenA = ''
let tokenB = ''

interface CallOptions {
  method?: string
  body?: unknown
  token?: string
  userIdHeader?: string
  origin?: string
}

async function call(
  path: string,
  { method = 'GET', body, token, userIdHeader, origin }: CallOptions = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`
  if (userIdHeader !== undefined) headers['x-user-id'] = userIdHeader
  if (origin !== undefined) headers['origin'] = origin
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
}

async function registerAccount(tag: string): Promise<{ id: string; email: string; token: string }> {
  const res = await call('/api/auth/register', {
    method: 'POST',
    body: { email: `${tag}@phasec.test`, password: PASSWORD },
  })
  expect(res.status).toBe(201)
  return { id: res.body.user.id, email: res.body.user.email, token: res.body.token }
}

/** Seeds what /api/profile/improve requires, using real authenticated calls. */
async function seedImproveableProfile(token: string): Promise<void> {
  for (const fact of [
    { category: 'identity', key: 'role', value: 'Junior Developer Intern', source: 'user_confirmation' },
    { category: 'skill', key: 'TypeScript', value: 'Used across LifeHub', source: 'user_profile' },
  ]) {
    const res = await call('/api/profile-facts', {
      method: 'POST',
      token,
      body: { type: 'fact', ...fact, status: 'verified' },
    })
    expect(res.status).toBe(201)
  }
  const profile = await call('/api/profile', {
    method: 'PUT',
    token,
    body: { headline: 'TypeScript Developer', about: 'Working with TypeScript.' },
  })
  expect(profile.status).toBe(200)
}

interface ApprovedPipeline {
  proposalId: string
  actionIds: string[]
}

async function buildApprovedPipeline(token: string, target = 'headline'): Promise<ApprovedPipeline> {
  // Self-sufficient: ensure the account always satisfies the improver's
  // verified-facts requirement (duplicate facts are permitted by design).
  await seedImproveableProfile(token)
  const improve = await call('/api/profile/improve', { method: 'POST', token, body: { target } })
  expect(improve.status).toBe(201)
  const proposalId = improve.body.proposal.id as string
  const approve = await call(`/api/proposals/${proposalId}/approve`, { method: 'POST', token, body: {} })
  expect(approve.status).toBe(200)
  const actions = await call('/api/linkedin/actions', { token })
  const owned = (actions.body.actions as Array<Record<string, unknown>>).filter(
    (a) => a.proposalId === proposalId && a.status === 'approved',
  )
  expect(owned.length).toBeGreaterThan(0)
  return { proposalId, actionIds: owned.map((a) => String(a.id)) }
}

/** Obtains a brand-new valid session for an account (older suites may have expired/logged-out cached tokens). */
async function freshLogin(email: string): Promise<string> {
  const res = await call('/api/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  })
  expect(res.status).toBe(200)
  return res.body.token as string
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await connectMongo(mongo.getUri('phase_c_hardening'), 'phase_c_hardening')
  await new Promise<void>((resolve) => {
    server = createServer(createApp())
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
  const a = await registerAccount('hardening-a')
  userA = a.id
  tokenA = a.token
  const b = await registerAccount('hardening-b')
  tokenB = b.token
})

afterAll(async () => {
  server.close()
  await disconnectMongo()
  await mongo.stop()
})

afterEach(() => {
  resetRateLimits()
})

describe('PHASE C — auth & boundary regressions', () => {
  it('C-01 — unauthenticated API requests are rejected', async () => {
    const res = await call('/api/profile-facts')
    expect(res.status).toBe(401)
  })

  it('C-02 — forged x-user-id is rejected', async () => {
    const res = await call('/api/profile-facts', { userIdHeader: '5f1f7a4c9d3e2b1a0c8d7e6a' })
    expect(res.status).toBe(401)
  })

  it('C-03 — cross-user access is rejected (A cannot read B resource)', async () => {
    const fact = await call('/api/profile-facts', {
      method: 'POST',
      token: tokenB,
      body: { type: 'fact', category: 'skill', key: 'SecretSkill', value: 'v', status: 'verified', source: 'user_profile' },
    })
    const res = await call(`/api/profile-facts/${fact.body.fact.id}`, { token: tokenA })
    expect(res.status).toBe(404)
  })

  it('C-04 — cross-user execution is rejected', async () => {
    await seedImproveableProfile(tokenB)
    const pipeline = await buildApprovedPipeline(tokenB)
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      token: tokenA,
    })
    expect([404, 409]).toContain(res.status)
    const bView = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}`, { token: tokenB })
    expect(bView.body.action.status).not.toBe('completed')
  })
})

describe('PHASE C — rate limiting (AUTH-RL / C-05 / C-06)', () => {
  it('AUTH-RL-01 / C-05 — repeated login attempts eventually return 429', async () => {
    // Attempt 1: a valid login must succeed BEFORE any lockout (also AUTH-RL-03).
    const ok = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    expect(ok.status).toBe(200)

    // Attempts 2..10: wrong passwords stay generic 401.
    for (let i = 0; i < 9; i++) {
      const res = await call('/api/auth/login', {
        method: 'POST',
        body: { email: 'hardening-a@phasec.test', password: 'wrong-password-x' },
      })
      expect(res.status).toBe(401)
    }

    // Attempt 11 crosses the window budget: 429 + Retry-After, consistent shape.
    const blocked = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toBe('RATE_LIMITED')
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)

    // Even the CORRECT password is now blocked — brute force gains nothing.
    const stillBlocked = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    expect(stillBlocked.status).toBe(429)
  })

  it('AUTH-RL-02 / C-06 — register abuse eventually returns 429', async () => {
    // Two more legitimate registrations work inside the budget…
    expect((await registerAccount('rl-reg-1')).id).toBeTruthy()
    expect((await registerAccount('rl-reg-2')).id).toBeTruthy()

    // …then cheap invalid payloads push the bucket over its limit.
    let sawLimit = false
    for (let i = 0; i < 60 && !sawLimit; i++) {
      const res = await call('/api/auth/register', {
        method: 'POST',
        body: { email: 'not-an-email', password: 'x' },
      })
      if (res.status === 429) {
        sawLimit = true
        expect(res.body.error).toBe('RATE_LIMITED')
        expect(res.headers.get('retry-after')).toBeTruthy()
      } else {
        expect(res.status).toBe(400)
      }
    }
    expect(sawLimit).toBe(true)

    // A fully valid registration is ALSO blocked once limited (abuse protection).
    const blockedValid = await call('/api/auth/register', {
      method: 'POST',
      body: { email: 'blocked-valid@phasec.test', password: PASSWORD },
    })
    expect(blockedValid.status).toBe(429)
  })

  it('AUTH-RL-03 — valid login succeeds before the rate limit engages', async () => {
    const res = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-b@phasec.test', password: PASSWORD },
    })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
  })

  it('AUTH-RL-04 — rate-limit responses leak no credentials and keep a consistent shape', async () => {
    for (let i = 0; i < 11; i++) {
      await call('/api/auth/login', {
        method: 'POST',
        body: { email: 'hardening-a@phasec.test', password: 'wrong-password-x' },
      })
    }
    const limited = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'top-secret-target@phasec.test', password: 'super-secret-passphrase' },
    })
    expect(limited.status).toBe(429)
    const raw = JSON.stringify(limited.body)
    expect(Object.keys(limited.body).sort()).toEqual(['error', 'message'])
    expect(limited.body.error).toBe('RATE_LIMITED')
    expect(raw).not.toContain('top-secret-target@phasec.test')
    expect(raw).not.toContain('super-secret-passphrase')
  })
})

describe('PHASE C — session hardening (C-07/C-08/C-09, SESSION-01…06)', () => {
  it('SESSION-01 / C-07 — expired sessions are rejected', async () => {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    const token = login.body.token as string
    await AuthSessionModel.updateMany(
      { userId: userA },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    )
    const res = await call('/api/profile-facts', { token })
    expect(res.status).toBe(401)
  })

  it('SESSION-02 / C-08 — logged-out sessions are rejected', async () => {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-b@phasec.test', password: PASSWORD },
    })
    const token = login.body.token as string
    const logout = await call('/api/auth/logout', { method: 'POST', token })
    expect(logout.status).toBe(200)
    const res = await call('/api/profile-facts', { token })
    expect(res.status).toBe(401)
  })

  it('SESSION-03 / C-09 — random invalid bearer tokens are rejected', async () => {
    const res = await call('/api/profile-facts', { token: 'totally-random-invalid-token' })
    expect(res.status).toBe(401)
  })

  it('SESSION-04 — raw tokens are never persisted; only SHA-256 digests', async () => {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    const rawToken = login.body.token as string
    const sessions = await AuthSessionModel.find({ userId: userA }).lean()
    expect(sessions.length).toBeGreaterThan(0)
    for (const session of sessions) {
      expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/)
      expect(session.tokenHash).not.toBe(rawToken)
      expect(JSON.stringify(session)).not.toContain(rawToken)
    }
  })

  it('SESSION-05 — tokens never appear in audit records', async () => {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    const rawToken = login.body.token as string
    await call('/api/profile-facts', {
      method: 'POST',
      token: rawToken,
      body: { type: 'fact', category: 'skill', key: 'AuditProbe', value: 'v', status: 'verified', source: 'user_profile' },
    })
    const events = await AuditEventModel.find({ userId: userA }).lean()
    expect(events.length).toBeGreaterThan(0)
    expect(JSON.stringify(events)).not.toContain(rawToken)
  })

  it('SESSION-06 — tokens never appear in error responses', async () => {
    const probe = 'probe-token-that-must-not-leak-1234567890'
    const res = await call('/api/profile-facts', { token: probe })
    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain(probe)
  })
})

describe('PHASE C — transport hardening', () => {
  it('C-10 — oversized request bodies are rejected with 413', async () => {
    const token = await freshLogin('hardening-a@phasec.test')
    const huge = 'x'.repeat(1_500_000)
    const res = await call('/api/posts', {
      method: 'POST',
      token,
      body: { text: huge },
    })
    expect(res.status).toBe(413)
    expect(res.body.error).toBe('PAYLOAD_TOO_LARGE')

    // Legitimate sizes still pass through the parser untouched.
    const normal = await call('/api/posts', {
      method: 'POST',
      token,
      body: { text: 'normal sized post' },
    })
    expect(normal.status).toBe(201)
  })

  it('CORS-01 — configured origins are accepted (preflight + actual)', async () => {
    const preflight = await call('/api/auth/login', {
      method: 'OPTIONS',
      origin: 'http://localhost:5173',
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull()

    const token = await freshLogin('hardening-a@phasec.test')
    const actual = await call('/api/profile-facts', {
      token,
      origin: 'http://localhost:5173',
    })
    expect(actual.status).toBe(200)
    expect(actual.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('CORS-02 / C-11 — unconfigured origins are rejected', async () => {
    const res = await call('/api/profile-facts', {
      token: tokenA,
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN_ORIGIN')
  })

  it('CORS-03 — a valid Origin never replaces authentication', async () => {
    const res = await call('/api/profile-facts', { origin: 'http://localhost:5173' })
    expect(res.status).toBe(401)
  })

  it('C-12 — required security headers are present on every response', async () => {
    const res = await call('/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('permissions-policy')).toContain('camera=()')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
  })
})

describe('PHASE C — secret leakage (C-13…C-17)', () => {
  it('C-13 — passwords never appear in any response', async () => {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-a@phasec.test', password: PASSWORD },
    })
    expect(login.status).toBe(200)
    const raw = JSON.stringify(login.body)
    expect(raw).not.toContain(PASSWORD)
    expect(raw).not.toContain('passwordHash')

    const me = await call('/api/auth/me', { token: login.body.token })
    expect(JSON.stringify(me.body)).not.toContain(PASSWORD)
  })

  it('C-14 — issued tokens are never echoed back by later responses', async () => {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'hardening-b@phasec.test', password: PASSWORD },
    })
    const token = login.body.token as string
    const me = await call('/api/auth/me', { token })
    expect(me.status).toBe(200)
    expect(JSON.stringify(me.body)).not.toContain(token)
    const facts = await call('/api/profile-facts', { token })
    expect(facts.status).toBe(200)
    expect(JSON.stringify(facts.body)).not.toContain(token)
  })

  it('C-15/C-16 — redactSecrets masks bearer tokens and passwords in diagnostics', () => {
    const sample =
      'login failed for user@example.com password=Hunter2Secret authorization: Bearer abc.def.ghi mongodb://root:s3cr3t@cluster.mongodb.net/db'
    const redacted = redactSecrets(sample)
    expect(redacted).not.toContain('Hunter2Secret')
    expect(redacted).not.toContain('abc.def.ghi')
    expect(redacted).not.toContain('s3cr3t')
    expect(redacted).toContain('[REDACTED]')
  })

  it('C-17 — MongoDB credentials never appear in error payloads', async () => {
    const token = await freshLogin('hardening-a@phasec.test')
    // Well-formed but nonexistent id → clean 404 with the safe error shape only.
    const res = await call('/api/proposals/000000000000000000000000', { token })
    expect(res.status).toBe(404)
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message'])
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb(\+srv)?:\/\//i)
    expect(JSON.stringify(res.body)).not.toMatch(/stack/i)
  })
})

describe('PHASE C — simulation executor cannot bypass the contract (C-18…C-20)', () => {
  // The session-hardening suite above deliberately expires/logs-out cached
  // tokens; these tests authenticate freshly so they exercise the live pipeline.
  let liveToken = ''
  beforeEach(async () => {
    resetRateLimits()
    liveToken = await freshLogin('hardening-a@phasec.test')
  })

  it('C-18 — out-of-scope (cancelled) actions are blocked before the simulation ever runs', async () => {
    const pipeline = await buildApprovedPipeline(liveToken, 'about')

    // User pulls this action out of the approved scope via the queue API.
    const cancel = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/cancel`, {
      method: 'POST',
      token: liveToken,
    })
    expect(cancel.status).toBe(200)

    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      token: liveToken,
    })
    // The contract rejects the execution BEFORE reaching the simulation provider.
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('EXECUTION_ERROR')
    expect(res.body.message).toMatch(/cancelled/i)
    // And nothing was executed.
    const after = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}`, { token: liveToken })
    expect(after.body.action.status).toBe('cancelled')
  })

  it('C-19 — tampered payloads fail the hash check before simulation', async () => {
    const pipeline = await buildApprovedPipeline(liveToken, 'headline')
    const tamper = await LinkedInActionModel.updateOne(
      { _id: pipeline.actionIds[0] },
      { $set: { 'payload.headline': 'Tampered After Approval' } },
    )
    expect(tamper.modifiedCount).toBe(1)

    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      token: liveToken,
    })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('EXECUTION_ERROR')
    expect(res.body.message).toMatch(/content_hash_match|content changed after approval/i)

    // The tampered action never reached any provider and was not completed.
    const after = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}`, { token: liveToken })
    expect(after.body.action.status).not.toBe('completed')
    expect(after.body.action.result).not.toBe('success')
  })

  it('C-20 — the simulation executor reports UNVERIFIED, never fake SUCCESS', async () => {
    const pipeline = await buildApprovedPipeline(liveToken, 'headline')
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      token: liveToken,
    })
    expect(res.status).toBe(200)
    expect(res.body.executed).toBe(true)
    expect(res.body.action.status).toBe('unverified')
    expect(res.body.result).toBe('unverified')
    expect(res.body.action.result).toBe('unverified')
    expect(res.body.reason).toMatch(/automation/i)
    // All 21+ contract checks passed on the way in…
    const checklistRaw = JSON.stringify(res.body.checklist)
    expect(checklistRaw).toContain('"passed":true')
    expect(checklistRaw).not.toContain('"passed":false')
    // …and no completion was faked anywhere in the response chain.
    expect(JSON.stringify(res.body)).not.toContain('"completed"')
  })
})
