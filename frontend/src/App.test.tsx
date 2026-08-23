import { render, screen } from '@testing-library/react'
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

describe('frontend smoke', () => {
  it('renders the app and the source of truth page', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'LinkedIn AI Agent' })).toBeTruthy()
    expect(await screen.findByText('Facts (0)')).toBeTruthy()
    expect(screen.getByText('No facts yet.')).toBeTruthy()
  })
})
