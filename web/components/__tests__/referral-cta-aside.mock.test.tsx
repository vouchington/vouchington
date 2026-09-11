import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReferralCtaAside } from '../referral-cta-aside'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

const mockNav = createNavMock()

describe('ReferralCtaAside', () => {
  beforeEach(() => {
    mockNav.reset()
    mockCurrentUser = null
  })

  it('renders nothing when user is authenticated', () => {
    mockCurrentUser = { id: 'user-1' } as User
    mockNav.setSearchParams('referrer=1')

    const { container } = render(<ReferralCtaAside />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when referrer param is absent', () => {
    const { container } = render(<ReferralCtaAside />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders CTAs when unauthenticated and referrer param present', () => {
    mockNav.setSearchParams('referrer=1')

    render(<ReferralCtaAside />)
    expect(screen.getByText('Get started')).toBeInTheDocument()
    expect(screen.getByText('Sign up')).toBeInTheDocument()
    expect(screen.getByText('Share a referral link')).toBeInTheDocument()
    expect(screen.getByText('Set up your landing page')).toBeInTheDocument()
  })

  it('dismisses the card when X button clicked', () => {
    mockNav.setSearchParams('referrer=1')

    const { container } = render(<ReferralCtaAside />)
    expect(screen.getByText('Get started')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('links to the correct hrefs', () => {
    mockNav.setSearchParams('referrer=1')

    render(<ReferralCtaAside />)
    expect(screen.getByRole('link', { name: /Sign up/i })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /Share a referral link/i })).toHaveAttribute(
      'href',
      '/referral-programs',
    )
    expect(screen.getByRole('link', { name: /Set up your landing page/i })).toHaveAttribute(
      'href',
      '/my/landing-pages',
    )
  })
})
