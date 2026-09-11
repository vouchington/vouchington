import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: User | null) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { SuspensionBanner } from '../suspension-banner'

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  roles: [],
  suspended_at: null,
  ...overrides,
})

describe('SuspensionBanner', () => {
  it('renders nothing for anonymous user', () => {
    mockCurrentUser = null
    const { container } = render(<SuspensionBanner notice={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for authenticated user without suspension', () => {
    mockCurrentUser = makeUser({ suspended_at: null })
    const { container } = render(<SuspensionBanner notice={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders banner when user is suspended without reason', () => {
    mockCurrentUser = makeUser({
      suspended_at: '2026-01-01T00:00:00.000Z',
      suspended_reason: null,
    })
    const { container } = render(<SuspensionBanner notice={{ reason: null }} />)
    expect(container.querySelector('[data-pw="suspension-banner"]')).not.toBeNull()
    expect(screen.getByText('Your account has been suspended')).toBeDefined()
    expect(
      screen.getByText('Your account access has been restricted by a moderator.'),
    ).toBeDefined()
    expect(screen.getByRole('link', { name: 'Learn more' })).toBeDefined()
  })

  it('renders banner with reason when user has a suspension reason', () => {
    mockCurrentUser = makeUser({
      suspended_at: '2026-01-01T00:00:00.000Z',
      suspended_reason: 'Violation of community guidelines.',
    })
    const { container } = render(
      <SuspensionBanner notice={{ reason: 'Violation of community guidelines.' }} />,
    )
    expect(container.querySelector('[data-pw="suspension-banner"]')).not.toBeNull()
    expect(screen.getByText('Violation of community guidelines.')).toBeDefined()
  })

  it('links "Learn more" to /my/account-status', () => {
    mockCurrentUser = makeUser({ suspended_at: '2026-01-01T00:00:00.000Z' })
    render(<SuspensionBanner notice={{ reason: null }} />)
    const link = screen.getByRole('link', { name: 'Learn more' })
    expect(link).toHaveAttribute('href', '/my/account-status')
  })
})
