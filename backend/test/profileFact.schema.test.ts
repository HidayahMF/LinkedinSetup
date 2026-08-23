import { describe, expect, it } from 'vitest'
import {
  createProfileFactSchema,
  listProfileFactsQuerySchema,
  updateProfileFactSchema,
} from '../src/domain/profile-facts/profileFact.schema.js'

const validCreate = {
  type: 'fact',
  category: 'skill',
  key: 'TypeScript',
  value: 'Used in LifeHub frontend',
  status: 'verified',
  source: 'user_profile',
}

describe('createProfileFactSchema', () => {
  it('accepts a valid authoritative fact', () => {
    expect(() => createProfileFactSchema.parse(validCreate)).not.toThrow()
  })

  it('rejects missing required fields', () => {
    const { value, ...missing } = validCreate
    expect(() => createProfileFactSchema.parse(missing)).toThrow()
    expect(() => createProfileFactSchema.parse({})).toThrow()
  })

  it('rejects invalid taxonomy values', () => {
    expect(() =>
      createProfileFactSchema.parse({ ...validCreate, category: 'hobbies' }),
    ).toThrow()
    expect(() => createProfileFactSchema.parse({ ...validCreate, type: 'guess' })).toThrow()
  })

  it('rejects invalid status values', () => {
    expect(() =>
      createProfileFactSchema.parse({ ...validCreate, status: 'probably_true' }),
    ).toThrow()
  })

  it('rejects empty, whitespace, or null values instead of assuming content', () => {
    expect(() => createProfileFactSchema.parse({ ...validCreate, value: '' })).toThrow()
    expect(() => createProfileFactSchema.parse({ ...validCreate, value: '   ' })).toThrow()
    expect(() => createProfileFactSchema.parse({ ...validCreate, value: null })).toThrow()
    expect(() => createProfileFactSchema.parse({ ...validCreate, value: undefined })).toThrow()
    expect(() => createProfileFactSchema.parse({ ...validCreate, value: [] })).toThrow()
    expect(() => createProfileFactSchema.parse({ ...validCreate, value: {} })).toThrow()
  })

  it('rejects GENERATED_POSITIONING stored as verified', () => {
    expect(() =>
      createProfileFactSchema.parse({
        ...validCreate,
        type: 'generated_positioning',
        key: 'headline',
        value: 'Full-Stack Developer',
        status: 'verified',
      }),
    ).toThrow(/cannot be stored as verified/i)
  })

  it('rejects INFERENCE stored as verified', () => {
    expect(() =>
      createProfileFactSchema.parse({
        ...validCreate,
        type: 'inference',
        value: 'Angular experience suggests frontend skills',
        status: 'verified',
      }),
    ).toThrow()
  })

  it('allows GENERATED_POSITIONING only as non-verified', () => {
    const parsed = createProfileFactSchema.parse({
      ...validCreate,
      type: 'generated_positioning',
      key: 'headline',
      value: 'Full-Stack Developer',
      status: 'needs_confirmation',
    })
    expect(parsed.status).toBe('needs_confirmation')
  })

  it('rejects unknown extra fields (no smuggled ownership/audit fields)', () => {
    expect(() =>
      createProfileFactSchema.parse({ ...validCreate, userId: 'attacker' }),
    ).toThrow()
    expect(() =>
      createProfileFactSchema.parse({ ...validCreate, createdAt: new Date() }),
    ).toThrow()
  })
})

describe('updateProfileFactSchema', () => {
  it('accepts partial updates', () => {
    expect(updateProfileFactSchema.parse({ status: 'do_not_use' })).toEqual({
      status: 'do_not_use',
    })
  })

  it('rejects empty patch objects', () => {
    expect(() => updateProfileFactSchema.parse({})).toThrow(/at least one field/)
  })

  it('rejects invalid taxonomy in patches', () => {
    expect(() => updateProfileFactSchema.parse({ type: 'rumor' })).toThrow()
  })
})

describe('listProfileFactsQuerySchema', () => {
  it('applies safe defaults and bounds for limit', () => {
    expect(listProfileFactsQuerySchema.parse({}).limit).toBe(50)
    expect(listProfileFactsQuerySchema.parse({ limit: '10' }).limit).toBe(10)
    expect(() => listProfileFactsQuerySchema.parse({ limit: '1000' })).toThrow()
    expect(() => listProfileFactsQuerySchema.parse({ limit: 'abc' })).toThrow()
  })

  it('rejects unknown query filters', () => {
    expect(() => listProfileFactsQuerySchema.parse({ userId: 'x' })).toThrow()
  })
})
