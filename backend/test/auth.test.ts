import './fixtures/testEnv.js'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { connectMongo, disconnectMongo } from '../src/database/mongo.js'
import { AuthSessionModel } from '../src/domain/auth/authSession.model.js'

let mongo: MongoMemoryServer
let server: Server
let baseUrl: string

interface CallOptions {
  method?: string
  body?: unknown
  token?: string
  /** Deliberately forged identity header — must NEVER grant access. */
  userIdHeader?: string
}

async function call(
  path: string,
  { method = 'GET', body, token, userIdHeader }: CallOptions = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`
  if (userIdHeader !== undefined) headers['x-user-id'] = userIdHeader
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const PASSWORD = 'correct-horse-battery'

/** Seeds what /api/profile/improve needs: an identity fact, a skill fact and a saved profile. */
async function seedImproveableProfile(token: string): Promise<void> {
  await call('/api/profile-facts', {
    method: 'POST',
    token,
    body: {
      type: 'fact',
      category: 'identity',
      key: 'role',
      value: 'Junior Developer Intern',
      status: 'verified',
      source: 'user_confirmation',
    },
  })
  await call('/api/profile-facts', {
    method: 'POST',
    token,
    body: {
      type: 'fact',
      category: 'skill',
      key: 'TypeScript',
      value: 'TypeScript used in LifeHub frontend and backend tooling',
      status: 'verified',
      source: 'user_profile',
    },
  })
  const profile = await call('/api/profile', {
    method: 'PUT',
    token,
    body: { headline: 'TypeScript Developer', about: 'Working with TypeScript.' },
  })
  expect(profile.status).toBe(200)
}

interface Account {
  id: string
  email: string
  token: string
}

async function createAccount(tag: string): Promise<Account> {
  const email = `${tag}@example.test`
  const registered = await call('/api/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD },
  })
  expect(registered.status).toBe(201)
  return {
    id: registered.body.user.id as string,
    email,
    token: registered.body.token as string,
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await connectMongo(mongo.getUri('auth_tests'), 'auth_tests')
  await new Promise<void>((resolve) => {
    server = createServer(createApp())
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

afterAll(async () => {
  server.close()
  await disconnectMongo()
  await mongo.stop()
})

describe('AUTH — real session authentication (flow.md §62/§63/§71)', () => {
  it('AUTH-01 — a forged x-user-id header is rejected on protected endpoints', async () => {
    const arbitrary = '5f1f7a4c9d3e2b1a0c8d7e6a'
    const res = await call('/api/profile-facts', { userIdHeader: arbitrary })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('AUTHENTICATION_ERROR')

    const write = await call('/api/profile-facts', {
      method: 'POST',
      userIdHeader: arbitrary,
      body: { type: 'fact', category: 'skill', key: 'X', value: 'x', status: 'verified', source: 'user_profile' },
    })
    expect(write.status).toBe(401)

    const execute = await call('/api/linkedin/execution/run', {
      method: 'POST',
      userIdHeader: arbitrary,
      body: {},
    })
    expect(execute.status).toBe(401)
  })

  it('AUTH-02 — unauthenticated requests are rejected everywhere; /health stays public', async () => {
    const health = await call('/health')
    expect(health.status).toBe(200)

    for (const path of [
      '/api/profile-facts',
      '/api/profile',
      '/api/profile/versions',
      '/api/proposals',
      '/api/approvals',
      '/api/linkedin/actions',
      '/api/posts',
      '/api/logs',
      '/api/reviews',
      '/api/agent/sessions/000000000000000000000000',
    ]) {
      const res = await call(path)
      expect(res.status, path).toBe(401)
    }

    const loginRequired = await call('/api/auth/login', { method: 'POST', body: {} })
    expect(loginRequired.status).toBe(400)
  })

  it('AUTH-03 — User A cannot read proposals, versions, approvals, actions, logs or posts of User B', async () => {
    const userA = await createAccount('reader-a')
    const userB = await createAccount('owner-b')

    // B creates owned resources across every sensitive collection.
    const fact = await call('/api/profile-facts', {
      method: 'POST',
      token: userB.token,
      body: { type: 'fact', category: 'skill', key: 'Angular', value: 'v', status: 'verified', source: 'user_profile' },
    })
    expect(fact.status).toBe(201)
    const factId = fact.body.fact.id as string

    const post = await call('/api/posts', {
      method: 'POST',
      token: userB.token,
      body: { text: 'B private draft' },
    })
    expect(post.status).toBe(201)
    const postId = post.body.post.id as string

    await seedImproveableProfile(userB.token)
    const improve = await call('/api/profile/improve', {
      method: 'POST',
      token: userB.token,
      body: { target: 'headline' },
    })
    expect(improve.status).toBe(201)
    const proposalId = improve.body.proposal.id as string

    const approve = await call(`/api/proposals/${proposalId}/approve`, {
      method: 'POST',
      token: userB.token,
      body: {},
    })
    expect(approve.status).toBe(200)
    const approvalId = approve.body.approvalRequest.id as string

    const actions = await call('/api/linkedin/actions', { token: userB.token })
    const bActionId = String(
      (actions.body.actions as Array<Record<string, unknown>>).find(
        (a) => a.proposalId === proposalId && a.status === 'approved',
      )!.id,
    )

    // A (validly authenticated) attempts to read every one of B's resources.
    const reads: Array<[string, number]> = [
      [`/api/profile-facts/${factId}`, 0],
      [`/api/proposals/${proposalId}`, 0],
      [`/api/approvals/${approvalId}`, 0],
      [`/api/linkedin/actions/${bActionId}`, 0],
      [`/api/posts/${postId}`, 0],
    ]
    for (const [path] of reads) {
      const res = await call(path, { token: userA.token })
      expect(res.status, path).toBe(404)
    }

    // List endpoints are scoped: nothing of B leaks into A's lists.
    const aFacts = await call('/api/profile-facts', { token: userA.token })
    expect(aFacts.body.facts).toHaveLength(0)
    const aProposals = await call('/api/proposals', { token: userA.token })
    expect(aProposals.body.proposals).toHaveLength(0)
    const aActions = await call('/api/linkedin/actions', { token: userA.token })
    expect(aActions.body.actions).toHaveLength(0)
    const aPosts = await call('/api/posts', { token: userA.token })
    expect(aPosts.body.posts).toHaveLength(0)
    const aLogs = await call('/api/logs', { token: userA.token })
    const aLogEvents = (aLogs.body.logs ?? []) as Array<Record<string, unknown>>
    // A's own auth lifecycle may appear, but nothing referencing B's resources.
    for (const bEntityId of [factId, postId, proposalId, approvalId, bActionId]) {
      expect(aLogEvents.some((e) => String(e.entityId) === bEntityId)).toBe(false)
    }

    // B still sees everything.
    const bFacts = await call('/api/profile-facts', { token: userB.token })
    expect(bFacts.body.facts.length).toBeGreaterThanOrEqual(1)
    const bPosts = await call('/api/posts', { token: userB.token })
    expect(bPosts.body.posts).toHaveLength(1)
  })

  it('AUTH-04 — User A cannot modify or delete data owned by User B', async () => {
    const userA = await createAccount('writer-a')
    const userB = await createAccount('writer-b')

    const fact = await call('/api/profile-facts', {
      method: 'POST',
      token: userB.token,
      body: { type: 'fact', category: 'skill', key: 'Node.js', value: 'v', status: 'verified', source: 'user_profile' },
    })
    const factId = fact.body.fact.id as string

    const patch = await call(`/api/profile-facts/${factId}`, {
      method: 'PATCH',
      token: userA.token,
      body: { value: 'hacked' },
    })
    expect(patch.status).toBe(404)

    const remove = await call(`/api/profile-facts/${factId}`, {
      method: 'DELETE',
      token: userA.token,
    })
    expect(remove.status).toBe(404)

    const restore = await call('/api/profile/versions/000000000000000000000000/restore', {
      method: 'POST',
      token: userA.token,
    })
    expect([404]).toContain(restore.status)

    // The resource is untouched.
    const verify = await call(`/api/profile-facts/${factId}`, { token: userB.token })
    expect(verify.status).toBe(200)
    expect(verify.body.fact.value).toBe('v')

    // A cannot edit B's proposal either.
    await seedImproveableProfile(userB.token)
    const improve = await call('/api/profile/improve', {
      method: 'POST',
      token: userB.token,
      body: { target: 'headline' },
    })
    expect(improve.status).toBe(201)
    const proposalId = improve.body.proposal.id as string
    const editByA = await call(`/api/proposals/${proposalId}/edit`, {
      method: 'POST',
      token: userA.token,
      body: { edits: [{ field: 'headline', after: 'Hacked' }] },
    })
    expect(editByA.status).toBe(404)
  })

  it('AUTH-05 — User A cannot execute an approved action belonging to User B', async () => {
    const userA = await createAccount('exec-a')
    const userB = await createAccount('exec-b')

    await call('/api/profile-facts', {
      method: 'POST',
      token: userB.token,
      body: {
        type: 'fact',
        category: 'identity',
        key: 'role',
        value: 'Junior Developer Intern',
        status: 'verified',
        source: 'user_confirmation',
      },
    })
    await call('/api/profile', {
      method: 'PUT',
      token: userB.token,
      body: { headline: 'TypeScript Developer', about: 'Working with TypeScript.' },
    })
    const improve = await call('/api/profile/improve', {
      method: 'POST',
      token: userB.token,
      body: { target: 'headline' },
    })
    const proposalId = improve.body.proposal.id as string
    const approve = await call(`/api/proposals/${proposalId}/approve`, {
      method: 'POST',
      token: userB.token,
      body: {},
    })
    expect(approve.status).toBe(200)
    const actions = await call('/api/linkedin/actions', { token: userB.token })
    const actionId = String((actions.body.actions as Array<Record<string, unknown>>)[0].id)

    const executeByA = await call(`/api/linkedin/actions/${actionId}/execute`, {
      method: 'POST',
      token: userA.token,
    })
    expect([404, 409]).toContain(executeByA.status)

    const runQueueByA = await call('/api/linkedin/execution/run', {
      method: 'POST',
      token: userA.token,
      body: {},
    })
    expect(runQueueByA.status).toBe(200)
    // A's queue is empty — B's action was never touched by A's queue run.
    expect(runQueueByA.body.processed ?? []).toHaveLength(0)

    const bActionAfter = await call(`/api/linkedin/actions/${actionId}`, { token: userB.token })
    expect(bActionAfter.status).toBe(200)
    expect(bActionAfter.body.action.status).not.toBe('completed')
  })

  it('AUTH-06 — User A cannot approve, reject or confirm publishing for User B proposal/post', async () => {
    const userA = await createAccount('approver-a')
    const userB = await createAccount('approver-b')

    await call('/api/profile-facts', {
      method: 'POST',
      token: userB.token,
      body: {
        type: 'fact',
        category: 'identity',
        key: 'role',
        value: 'Backend Intern',
        status: 'verified',
        source: 'user_confirmation',
      },
    })
    await seedImproveableProfile(userB.token)
    const improve = await call('/api/profile/improve', {
      method: 'POST',
      token: userB.token,
      body: { target: 'about' },
    })
    expect(improve.status).toBe(201)
    const proposalId = improve.body.proposal.id as string

    const approveByA = await call(`/api/proposals/${proposalId}/approve`, {
      method: 'POST',
      token: userA.token,
      body: {},
    })
    expect(approveByA.status).toBe(404)

    const rejectByA = await call(`/api/proposals/${proposalId}/reject`, {
      method: 'POST',
      token: userA.token,
    })
    expect(rejectByA.status).toBe(404)

    // B's own approval still works and A gained no approval record.
    const approveByB = await call(`/api/proposals/${proposalId}/approve`, {
      method: 'POST',
      token: userB.token,
      body: {},
    })
    expect(approveByB.status).toBe(200)

    // Post publish flow: A cannot request/confirm publishing of B's draft.
    const post = await call('/api/posts', {
      method: 'POST',
      token: userB.token,
      body: { text: 'B post' },
    })
    const postId = post.body.post.id as string
    const reqByA = await call(`/api/posts/${postId}/publish-request`, {
      method: 'POST',
      token: userA.token,
    })
    expect(reqByA.status).toBe(404)
    const confByA = await call(`/api/posts/${postId}/publish-confirm`, {
      method: 'POST',
      token: userA.token,
    })
    expect(confByA.status).toBe(404)
  })

  it('AUTH-07 — invalid tokens and expired sessions are rejected', async () => {
    const user = await createAccount('expiry-u')

    const garbage = await call('/api/profile-facts', { token: 'not-a-real-token' })
    expect(garbage.status).toBe(401)

    const malformedScheme = await fetch(`${baseUrl}/api/profile-facts`, {
      headers: { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` },
    })
    expect(malformedScheme.status).toBe(401)

    // Expire the session directly in the store (simulates elapsed TTL).
    const updated = await AuthSessionModel.updateMany(
      { userId: user.id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    )
    expect(updated.matchedCount).toBeGreaterThan(0)
    const expired = await call('/api/profile-facts', { token: user.token })
    expect(expired.status).toBe(401)

    // Logout invalidates the session permanently.
    const again = await call('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: PASSWORD },
    })
    expect(again.status).toBe(200)
    const freshToken = again.body.token as string
    const logout = await call('/api/auth/logout', { method: 'POST', token: freshToken })
    expect(logout.status).toBe(200)
    const afterLogout = await call('/api/profile-facts', { token: freshToken })
    expect(afterLogout.status).toBe(401)

    // Wrong password is a generic failure (no account enumeration).
    const wrongPassword = await call('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: 'wrong-password-1' },
    })
    expect(wrongPassword.status).toBe(401)
    const unknownUser = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'ghost@example.test', password: 'wrong-password-1' },
    })
    expect(unknownUser.status).toBe(401)
  })

  it('AUTH-08 — authenticated identity always comes from the verified session context', async () => {
    const userA = await createAccount('ctx-a')
    const userB = await createAccount('ctx-b')

    // A sends B's id in the legacy header while authenticating with A's real token:
    // the verified session wins; the header is ignored completely.
    const me = await call('/api/auth/me', { token: userA.token, userIdHeader: userB.id })
    expect(me.status).toBe(200)
    expect(me.body.user.id).toBe(userA.id)
    expect(me.body.user.email).toBe(userA.email)
    expect(me.body.user.passwordHash).toBeUndefined()

    const created = await call('/api/profile-facts', {
      method: 'POST',
      token: userA.token,
      userIdHeader: userB.id,
      body: { type: 'fact', category: 'skill', key: 'React', value: 'v', status: 'verified', source: 'user_profile' },
    })
    expect(created.status).toBe(201)
    const ownerId = created.body.fact.userId ?? created.body.fact.ownerId
    expect(String(ownerId)).toBe(userA.id)

    // The fact is invisible to the forged identity owner (B) and visible to A.
    const seenByB = await call(`/api/profile-facts/${created.body.fact.id}`, { token: userB.token })
    expect(seenByB.status).toBe(404)
    const seenByA = await call(`/api/profile-facts/${created.body.fact.id}`, { token: userA.token })
    expect(seenByA.status).toBe(200)
  })

  it('registration validation and duplicate accounts are enforced', async () => {
    const shortPassword = await call('/api/auth/register', {
      method: 'POST',
      body: { email: 'short@example.test', password: 'short' },
    })
    expect(shortPassword.status).toBe(400)

    const badEmail = await call('/api/auth/register', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'long-enough-passphrase' },
    })
    expect(badEmail.status).toBe(400)

    const first = await createAccount('dup-check')
    const duplicate = await call('/api/auth/register', {
      method: 'POST',
      body: { email: first.email, password: PASSWORD },
    })
    expect(duplicate.status).toBe(409)

    const reLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { email: first.email.toUpperCase(), password: PASSWORD },
    })
    expect(reLogin.status).toBe(200)
  })
})
