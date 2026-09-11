import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/asides/activity-signals'), () => ({
  hasLandingPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/dismissible-aside'), () => ({
  DismissibleAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasLandingPage } from '@/lib/asides/activity-signals'
import { CreateLandingPageAside } from './create-landing-page-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHasLandingPage = vi.mocked(hasLandingPage)

describe('CreateLandingPageAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await CreateLandingPageAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when user already has a landing page', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockHasLandingPage.mockResolvedValue(true)
    const result = await CreateLandingPageAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders landing page nudge when user has none', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockHasLandingPage.mockResolvedValue(false)
    const result = await CreateLandingPageAside()
    render(result as ReactElement)
    expect(screen.getByText('Create your landing page')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Build it' })).toBeDefined()
  })

  it('links to /my/landing-pages', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockHasLandingPage.mockResolvedValue(false)
    const result = await CreateLandingPageAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: 'Build it' }).getAttribute('href')).toBe(
      '/my/landing-pages',
    )
  })
})
