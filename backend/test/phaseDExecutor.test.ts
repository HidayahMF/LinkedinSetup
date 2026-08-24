/**
 * PHASE D — REAL PLAYWRIGHT EXECUTOR REGRESSION SUITE
 *
 * Real LinkedIn is NEVER touched here (STEP 12). The HTTP pipeline tests run
 * against the deterministic stub automation module (fixtures/testEnv.js), while
 * the PlaywrightProvider decision logic is exercised through injected FAKE
 * browser drivers. Chromium itself is only required for the manual smoke test.
 */
import './fixtures/testEnv.js'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { connectMongo, disconnectMongo } from '../src/database/mongo.js'
import { createProviderFromConfig, loadAutomationProvider } from '../src/execution/provider.js'
import { PlaywrightProvider } from '../src/infrastructure/automation/playwrightProvider.js'
import type { BrowserDriver, DriverSession } from '../src/infrastructure/automation/browserDriver.js'
import { redactSecrets } from '../src/security/redact.js'
import { verifyOutcome } from '../src/execution/executorController.js'
import { LinkedInActionModel } from '../src/execution/actions/action.model.js'
import { AuditEventModel } from '../src/audit/audit.model.js'
import { ProfileFactModel } from '../src/domain/profile-facts/profileFact.model.js'
import { ProposalModel } from '../src/domain/proposal/proposal.model.js'
import { ApprovalRequestModel } from '../src/domain/approval/approval.model.js'

let mongo: MongoMemoryServer
let server: Server
let baseUrl: string

const PASSWORD = 'phase-d-executor-pass'

declare global {
  // eslint-disable-next-line no-var
  var __stubMode: 'success' | 'challenge' | 'fail' | 'no_verify' | undefined
  // eslint-disable-next-line no-var
  var __lastExecutorInput: { actionType: string; payload: Record<string, unknown> } | undefined
}

let userA = ''
let userB = ''

const tokens = new Map<string, string>()
/** Every HTTP response captured during the suite — used by D-18. */
const capturedResponses: Array<{ status: number; headers: Headers; raw: string }> = []

interface CallOptions {
  method?: string
  body?: unknown
  user?: string
}

async function call(
  path: string,
  { method = 'GET', body, user }: CallOptions = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {}
  const token = user !== undefined ? tokens.get(user) : undefined
  if (token) headers['authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  capturedResponses.push({ status: res.status, headers: res.headers, raw: text })
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function ensureAccount(tag: string, assignTo: (id: string) => void): Promise<void> {
  const email = `${tag}@phased.test`
  let res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (res.status !== 201) {
    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
  }
  expect(res.status).toBeLessThanOrEqual(201)
  const payload = (await res.json()) as { user: { id: string }; token: string }
  tokens.set(payload.user.id, payload.token)
  assignTo(payload.user.id)
}

async function seedImproveableProfile(user: string): Promise<void> {
  for (const fact of [
    { category: 'identity', key: 'role', value: 'Junior Developer Intern', source: 'user_confirmation' },
    { category: 'skill', key: 'TypeScript', value: 'Used across LifeHub', source: 'user_profile' },
  ]) {
    const r = await call('/api/profile-facts', {
      method: 'POST',
      user,
      body: { type: 'fact', ...fact, status: 'verified' },
    })
    expect(r.status).toBe(201)
  }
  const p = await call('/api/profile', {
    method: 'PUT',
    user,
    body: { headline: 'TypeScript Developer', about: 'Working with TypeScript.' },
  })
  expect(p.status).toBe(200)
}

async function buildApprovedPipeline(
  user: string,
  target = 'headline',
): Promise<{ proposalId: string; actionIds: string[] }> {
  const improve = await call('/api/profile/improve', { method: 'POST', user, body: { target } })
  expect(improve.status).toBe(201)
  const proposalId = improve.body.proposal.id as string
  const approve = await call(`/api/proposals/${proposalId}/approve`, { method: 'POST', user, body: {} })
  expect(approve.status).toBe(200)
  const actions = await call('/api/linkedin/actions', { user })
  const owned = (actions.body.actions as Array<Record<string, unknown>>).filter(
    (a) => a.proposalId === proposalId && a.status === 'approved',
  )
  expect(owned.length).toBeGreaterThan(0)
  return { proposalId, actionIds: owned.map((a) => String(a.id)) }
}

// ---------------------------------------------------------------------------
// Fake browser driver infrastructure for PlaywrightProvider unit tests
// ---------------------------------------------------------------------------

interface FakeSessionSpec {
  /** Redirect map applied when navigating (simulates LinkedIn auth redirects). */
  redirects?: Record<string, string>
  initialUrl?: string
  visibleSelectors?: string[]
  texts?: Record<string, string>
  navigateError?: Error
}

function makeFakeDriver(spec: FakeSessionSpec): BrowserDriver & { session: DriverSession } {
  let currentUrl = spec.initialUrl ?? ''
  const session: DriverSession = {
    async navigate(url) {
      if (spec.navigateError) throw spec.navigateError
      currentUrl = spec.redirects?.[url] ?? url
    },
    currentUrl() {
      return currentUrl
    },
    async queryText(selectors) {
      for (const s of selectors) if (spec.texts?.[s] !== undefined) return spec.texts[s]
      return null
    },
    async queryVisible(selectors) {
      return (spec.visibleSelectors ?? []).some((v) => selectors.includes(v))
    },
    async fill() {
      /* recorded implicitly */
    },
    async click() {
      /* recorded implicitly */
    },
    async waitForSelector() {
      return true
    },
    async close() {},
  }
  return { open: async () => session, session }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await connectMongo(mongo.getUri('phase_d_executor'), 'phase_d_executor')
  await new Promise<void>((resolve) => {
    server = createServer(createApp())
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
  await ensureAccount('phase-d-user-a', (id) => void (userA = id))
})

afterEach(async () => {
  globalThis.__stubMode = undefined
  await Promise.all([
    ProfileFactModel.deleteMany({}),
    AuditEventModel.deleteMany({}),
    ProposalModel.deleteMany({}),
    ApprovalRequestModel.deleteMany({}),
    LinkedInActionModel.deleteMany({}),
  ])
})

afterAll(async () => {
  server.close()
  await disconnectMongo()
  await mongo.stop()
})

describe('PHASE D — provider architecture (D-01…D-03)', () => {
  it('D-01 — the playwright provider can be created without launching anything', () => {
    const provider = PlaywrightProvider.create({ profilePath: '/tmp/dummy-profile', headless: true })
    expect(provider.name).toBe('playwright')
    expect(typeof provider.execute).toBe('function')
  })

  it('D-02 — missing LINKEDIN_BROWSER_PROFILE_PATH fails closed; invalid config fails closed', () => {
    expect(() => createProviderFromConfig({ kind: 'playwright' })).toThrow(/LINKEDIN_BROWSER_PROFILE_PATH/)
    expect(() => createProviderFromConfig({ kind: 'module' })).toThrow(/AUTOMATION_MODULE/)
    expect(() => createProviderFromConfig({ kind: 'teleport' as never })).toThrow(/unknown AUTOMATION_PROVIDER/)
  })

  it('D-03 — the simulation provider remains available and honest', async () => {
    const simulation = createProviderFromConfig({ kind: 'simulation' })
    expect(simulation.name).toBe('simulation')
    const result = await simulation.execute({ actionType: 'update_headline', payload: {} })
    expect(result.outcome).toBe('unverified')

    // Legacy resolution still works: testEnv sets AUTOMATION_MODULE → module provider.
    const loaded = await loadAutomationProvider()
    expect(loaded.name).toContain('module:')
  })
})

describe('PHASE D — the execution contract gates every browser entry (D-04…D-08)', () => {
  it('D-04 — an action without an approval record never reaches Playwright', async () => {
    await seedImproveableProfile(userA)
    const improve = await call('/api/profile/improve', { method: 'POST', user: userA, body: { target: 'headline' } })
    const proposalId = improve.body.proposal.id as string

    // Orphan action: valid proposal/version binding but NO ApprovalRequest record.
    const proposal = await ProposalModel.findById(proposalId).lean()
    const planned = (proposal!.plannedActions as Array<Record<string, unknown>>)[0]!
    await LinkedInActionModel.create({
      userId: userA,
      proposalId,
      versionId: String(proposal!.versionId),
      approvalRequestId: '000000000000000000000000',
      plannedActionId: String(planned.actionId),
      actionType: planned.actionType,
      riskLevel: planned.riskLevel,
      targetField: String(planned.targetField ?? 'headline'),
      summary: 'orphan',
      payload: planned.payload,
      contentHash: 'x'.repeat(64),
      queueOrder: 1,
      status: 'approved',
    })

    const actions = await call('/api/linkedin/actions', { user: userA })
    const orphanId = String(actions.body.actions.at(-1).id)
    const res = await call(`/api/linkedin/actions/${orphanId}/execute`, { method: 'POST', user: userA })
    expect(res.status).toBe(409)
    expect(res.body.message).toContain('approval_exists')
  })

  it('D-05 — a rejected/excluded action never reaches Playwright', async () => {
    await seedImproveableProfile(userA)
    const improve = await call('/api/profile/improve', { method: 'POST', user: userA, body: { target: 'about' } })
    const proposalId = improve.body.proposal.id as string
    const preview = await call('/api/proposals', { user: userA })
    const target = (preview.body.proposals as Array<Record<string, unknown>>).find((p) => p.id === proposalId)!
    const plannedIds = ((target.plannedActions ?? []) as Array<Record<string, unknown>>).map((a) => String(a.actionId))
    // Explicit EMPTY approved scope + every id rejected → the whole proposal is
    // excluded (flow.md §47); omitting approvedActionIds would default to "approve all".
    const approve = await call(`/api/proposals/${proposalId}/approve`, {
      method: 'POST',
      user: userA,
      body: { approvedActionIds: [], rejectedActionIds: plannedIds },
    })
    expect(approve.status).toBe(200)

    const actions = await call('/api/linkedin/actions', { user: userA })
    const excluded = (actions.body.actions as Array<Record<string, unknown>>).find(
      (a) => a.proposalId === proposalId && a.status === 'rejected',
    )
    expect(excluded).toBeTruthy()
    const res = await call(`/api/linkedin/actions/${String(excluded!.id)}/execute`, { method: 'POST', user: userA })
    expect(res.status).toBe(409)
  })

  it('D-06 — a cancelled action never reaches Playwright', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    const cancel = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/cancel`, {
      method: 'POST',
      user: userA,
    })
    expect(cancel.status).toBe(200)
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/cancelled/i)
  })

  it('D-07 — a contentHash mismatch never reaches Playwright', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    await LinkedInActionModel.updateOne(
      { _id: pipeline.actionIds[0] },
      { $set: { 'payload.headline': 'Tampered After Approval' } },
    )
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/content_hash_match/i)
  })

  it('D-08 — an ownership mismatch never reaches Playwright', async () => {
    await seedImproveableProfile(userA)
    await ensureAccount('phase-d-user-b', (id) => void (userB = id))
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userB,
    })
    expect([404, 409]).toContain(res.status)
    const ownerView = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}`, { user: userA })
    expect(ownerView.body.action.status).toBe('approved')
  })
})

describe('PHASE D — payload integrity & isolation (D-09, D-10)', () => {
  it('D-09 — the executor receives exactly the immutable approved payload', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    expect(res.status).toBe(200)
    const stored = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}`, { user: userA })
    expect(globalThis.__lastExecutorInput).toEqual({
      actionType: stored.body.action.actionType,
      payload: stored.body.action.payload,
    })
  })

  it('D-10 — the executor infrastructure has no import path into or out of the AI layer', () => {
    const infraDir = join(process.cwd(), 'src', 'infrastructure', 'automation')
    for (const file of ['playwrightProvider.ts', 'browserDriver.ts', 'simulationProvider.ts']) {
      const src = readFileSync(join(infraDir, file), 'utf8')
      expect(src, file).not.toMatch(/from\s+['"].*(agent|orchestrator|ai)\//i)
      expect(src, file).not.toMatch(/\.\.\/\.\.\/agent/)
    }
    const controllerSrc = readFileSync(join(process.cwd(), 'src', 'execution', 'executorController.ts'), 'utf8')
    expect(controllerSrc).not.toMatch(/from\s+['"].*agent\//i)
  })
})

describe('PHASE D — browser decision logic via fake drivers (D-11…D-14, D-19)', () => {
  it('D-11 — a login/checkpoint redirect PAUSES execution as a challenge', async () => {
    const driver = makeFakeDriver({
      redirects: { 'https://www.linkedin.com/feed/': 'https://www.linkedin.com/checkpoint/challenge/x' },
    })
    const provider = PlaywrightProvider.create({ profilePath: 'x', headless: true }, driver)
    const outcome = await provider.execute({ actionType: 'update_headline', payload: { headline: 'H' } })
    expect(outcome.outcome).toBe('challenge')
    expect(outcome.message).toMatch(/SECURITY_CHALLENGE/)
  })

  it('D-12 — CAPTCHA / 2FA surfaces PAUSE execution as a challenge', async () => {
    const driver = makeFakeDriver({
      initialUrl: 'https://www.linkedin.com/feed/',
      visibleSelectors: ['iframe[src*="captcha"]'],
    })
    const provider = PlaywrightProvider.create({ profilePath: 'x', headless: true }, driver)
    const outcome = await provider.execute({ actionType: 'update_about', payload: { about: 'A' } })
    expect(outcome.outcome).toBe('challenge')

    const driver2 = makeFakeDriver({
      initialUrl: 'https://www.linkedin.com/feed/',
      visibleSelectors: ['input[name="pinNumber"]'],
    })
    const outcome2 = await provider.execute.call(
      Object.assign(Object.create(Object.getPrototypeOf(provider)), provider, { driver: driver2 }),
      { actionType: 'update_about', payload: { about: 'A' } },
    )
    expect(outcome2.outcome).toBe('challenge')
  })

  it('D-13 — read-back comparison drives VERIFIED vs UNVERIFIED', async () => {
    // Provider returns what it read back…
    const expected = 'Verified Headline Text'
    const matching = makeFakeDriver({
      visibleSelectors: ['.text-body-medium.break-words'],
      texts: { '.text-body-medium.break-words': expected },
    })
    const provider = PlaywrightProvider.create({ profilePath: 'x', headless: true }, matching)
    const outcome = await provider.execute({
      actionType: 'update_headline',
      payload: { headline: expected },
    })
    expect(outcome.outcome).toBe('success')
    expect(outcome.observedAfter).toBe(expected)

    const actionLike = { actionType: 'update_headline', payload: { headline: expected } } as never
    expect(verifyOutcome(actionLike, expected)).toBe(true)
    // …and ANY difference in the read-back means UNVERIFIED, never SUCCESS.
    expect(verifyOutcome(actionLike, 'Something Else Entirely')).toBe(false)
  })

  it('D-14 — a navigation failure is FAILED, never SUCCESS', async () => {
    const driver = makeFakeDriver({ navigateError: new Error('net::ERR_NAME_NOT_RESOLVED') })
    const provider = PlaywrightProvider.create({ profilePath: 'x', headless: true }, driver)
    const outcome = await provider.execute({ actionType: 'update_headline', payload: { headline: 'H' } })
    expect(outcome.outcome).toBe('failed')
    expect(outcome.message).toMatch(/EXECUTION_ERROR/)
    expect(outcome.observedAfter).toBeUndefined()
  })

  it('D-19 — a broken browser setup fails loudly and is NEVER swapped for simulation', async () => {
    const brokenDriver: BrowserDriver = {
      open: async () => {
        throw new Error('Executable does not exist')
      },
    }
    const provider = PlaywrightProvider.create({ profilePath: 'x', headless: true }, brokenDriver)
    const outcome = await provider.execute({ actionType: 'update_headline', payload: { headline: 'H' } })
    expect(outcome.outcome).toBe('failed')
    expect(outcome.message).toContain('browser could not be started')

    // And the factory keeps returning the PLAYWRIGHT provider (no silent swap).
    const configured = createProviderFromConfig({ kind: 'playwright', browserProfilePath: '/tmp/p' })
    expect(configured.name).toBe('playwright')
  })
})

describe('PHASE D — end-to-end honesty through the real pipeline (D-15, D-16, D-18, D-20)', () => {
  it('D-15 — a COMPLETED action cannot be executed twice', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    const first = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    expect(first.status).toBe(200)
    expect(first.body.action.status).toBe('completed')

    const second = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    expect(second.status).toBe(409)
    expect(second.body.message).toMatch(/already/i)
  })

  it('D-16 — execution AND its result are recorded in the append-only audit log', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, { method: 'POST', user: userA })
    const events = await AuditEventModel.find({ userId: userA }).lean()
    const actionTypes = events.map((e) => e.actionType)
    expect(actionTypes).toContain('action.planned')
    expect(actionTypes).toContain('action.executed')

    // Failed attempts are recorded too — never rewritten into successes.
    const tamperedPipeline = await buildApprovedPipeline(userA, 'about')
    await LinkedInActionModel.updateOne(
      { _id: tamperedPipeline.actionIds[0] },
      { $set: { 'payload.about': 'Tampered' } },
    )
    await call(`/api/linkedin/actions/${tamperedPipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    const eventsAfter = await AuditEventModel.find({ userId: userA }).lean()
    expect(eventsAfter.map((e) => e.actionType)).toContain('action.failed')
  })

  it('D-18 — no cookie or session token ever appears in an API response', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, { method: 'POST', user: userA })
    for (const captured of capturedResponses) {
      expect(captured.headers.get('set-cookie')).toBeNull()
      expect(captured.raw).not.toMatch(/li_at=|jsessionid=/i)
    }
  })

  it('D-20 — passing the contract but failing verification is UNVERIFIED, not COMPLETED', async () => {
    await seedImproveableProfile(userA)
    const pipeline = await buildApprovedPipeline(userA, 'headline')
    globalThis.__stubMode = 'no_verify'
    const res = await call(`/api/linkedin/actions/${pipeline.actionIds[0]}/execute`, {
      method: 'POST',
      user: userA,
    })
    expect(res.status).toBe(200)
    expect(res.body.action.status).toBe('unverified')
    expect(res.body.result).toBe('unverified')
    expect(JSON.stringify(res.body)).not.toContain('"completed"')
  })
})

describe('PHASE D — secret hygiene (D-17)', () => {
  it('D-17 — cookies and session secrets are masked by the log redactor', () => {
    const sample =
      'Set-Cookie: li_at=AQEDABCDEFG; domain=.linkedin.com bcookie="v=2&abc123" JSESSIONID=node01xyz'
    const redacted = redactSecrets(sample)
    expect(redacted).not.toContain('AQEDABCDEFG')
    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('node01xyz')
    expect(redacted).toContain('[REDACTED]')
  })
})
