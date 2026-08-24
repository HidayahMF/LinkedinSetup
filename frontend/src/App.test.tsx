import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./services/profileFacts', () => ({
  profileFactsService: {
    list: vi.fn(() => Promise.resolve({ facts: [] })),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('./services/auth', () => ({
  me: vi.fn(() =>
    Promise.resolve({ id: 'a'.repeat(24), email: 'smoke@example.test' }),
  ),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(async () => undefined),
}))

describe('frontend smoke', () => {
  it('renders the app and the source of truth page for an authenticated session', async () => {
    render(<App />)
    expect(await screen.findByText('Source of Truth')).toBeTruthy()
    expect(screen.getByText('No facts yet.')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('~/linkedin-agent')).toBeTruthy()
    })
    expect(screen.getAllByText('smoke@example.test').length).toBeGreaterThan(0)
  })

  it('shows the login screen when no verified session exists', async () => {
    const auth = await import('./services/auth')
    vi.mocked(auth.me).mockResolvedValueOnce(null)
    render(<App />)
    expect(await screen.findByText('~/linkedin-agent')).toBeTruthy()
    expect(screen.getByLabelText('email')).toBeTruthy()
    expect(screen.getByLabelText('password')).toBeTruthy()
    expect(screen.queryByText('Source of Truth')).toBeNull()
  })
})
