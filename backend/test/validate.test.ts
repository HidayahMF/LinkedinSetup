import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validate } from '../src/validation/validate.js'
import { envSchema } from '../src/config/env.js'

describe('input validation foundation', () => {
  it('returns parsed data when payload is valid', () => {
    const schema = z.object({ name: z.string() })
    expect(validate(schema, { name: 'LifeHub' })).toEqual({ name: 'LifeHub' })
  })

  it('throws ZodError when payload is invalid', () => {
    const schema = z.object({ name: z.string() })
    expect(() => validate(schema, { name: 42 })).toThrow()
  })

  it('env schema coerces PORT to a number', () => {
    const parsed = envSchema.parse({ NODE_ENV: 'test', PORT: '4000' })
    expect(parsed.PORT).toBe(4000)
    expect(parsed.NODE_ENV).toBe('test')
  })

  it('env schema applies safe defaults', () => {
    const parsed = envSchema.parse({})
    expect(parsed.PORT).toBe(3000)
    expect(parsed.MONGODB_DATABASE).toBe('linkedin_ai_agent')
  })

  it('env schema rejects non-numeric PORT', () => {
    expect(() => envSchema.parse({ PORT: 'not-a-number' })).toThrow()
  })
})
