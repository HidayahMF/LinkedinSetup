import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileFactsPage from '../pages/ProfileFactsPage'
import { profileFactsService } from '../services/profileFacts'
import type { ProfileFact } from '../types/profileFact'

vi.mock('../services/profileFacts', () => ({
  profileFactsService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const factA: ProfileFact = {
  id: 'a'.repeat(24),
  userId: 'u1',
  type: 'fact',
  category: 'skill',
  key: 'TypeScript',
  value: 'Used in LifeHub',
  status: 'verified',
  source: 'user_profile',
  sourceReference: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const mocked = vi.mocked(profileFactsService)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfileFactsPage', () => {
  it('lists existing facts with type and status badges', async () => {
    mocked.list.mockResolvedValue({ facts: [factA] })
    render(<ProfileFactsPage />)
    expect(await screen.findByText('TypeScript')).toBeTruthy()
    expect(screen.getAllByText('verified').length).toBeGreaterThan(0)
    expect(screen.getByText('FACT')).toBeTruthy()
  })

  it('submits a new fact through the service and reloads', async () => {
    const user = userEvent.setup()
    mocked.list
      .mockResolvedValueOnce({ facts: [] })
      .mockResolvedValueOnce({ facts: [factA] })
    mocked.create.mockResolvedValue({ fact: factA })
    render(<ProfileFactsPage />)

    await screen.findByText(/add verified profile fact/i)
    await user.type(screen.getByLabelText('key'), 'Role')
    await user.type(screen.getByLabelText('value'), 'Junior Developer Intern')
    await user.click(screen.getByRole('button', { name: /add fact/i }))

    expect(mocked.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Role', value: 'Junior Developer Intern' }),
    )
    expect(mocked.list).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Facts (1)')).toBeTruthy()
  })

  it('shows validation errors returned by the API without clearing the form state', async () => {
    const user = userEvent.setup()
    mocked.list.mockResolvedValue({ facts: [] })
    mocked.create.mockRejectedValue(
      new Error('VALIDATION_ERROR — status: type "generated_positioning" cannot be stored as verified'),
    )
    render(<ProfileFactsPage />)

    await screen.findByText(/add verified profile fact/i)
    await user.click(screen.getByRole('button', { name: /add fact/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('cannot be stored as verified')
    expect(screen.queryByText('Fact created')).toBeNull()
  })

  it('deletes a fact after confirmation', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    mocked.list
      .mockResolvedValueOnce({ facts: [factA] })
      .mockResolvedValueOnce({ facts: [] })
    mocked.remove.mockResolvedValue(undefined)
    render(<ProfileFactsPage />)

    await screen.findByText('TypeScript')
    await user.click(screen.getByRole('button', { name: 'delete' }))
    expect(mocked.remove).toHaveBeenCalledWith(factA.id)
    expect(await screen.findByText('Facts (0)')).toBeTruthy()
  })
})
