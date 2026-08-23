import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

let server: Server
let baseUrl: string

beforeAll(async () => {
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
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('GET /health', () => {
  it('returns 200 with ok status', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('unknown routes return 404 JSON error', async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('NOT_FOUND')
  })

  it('malformed JSON body returns 400 validation error', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('VALIDATION_ERROR')
  })
})
