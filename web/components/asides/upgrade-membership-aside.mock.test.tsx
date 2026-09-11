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

vi.mock(import('@/lib/api/server'), () => ({
  getMembership: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/dismissible-aside'), () => ({
  DismissibleAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMembership } from '@/lib/api/server'
import { UpgradeMembershipAside } from './upgrade-membership-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockGetMembership = vi.mocked(getMembership)

describe('UpgradeMembershipAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await UpgradeMembershipAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when user has active membership', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockGetMembership.mockResolvedValue({
      membership: { status: 'active' },
    } as Awaited<ReturnType<typeof getMembership>>)
    const result = await UpgradeMembershipAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders upgrade CTA for authenticated free-tier users', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockGetMembership.mockResolvedValue({
      membership: null,
    } as Awaited<ReturnType<typeof getMembership>>)
    const result = await UpgradeMembershipAside()
    render(result as ReactElement)
    expect(screen.getByText('Upgrade to Plus')).toBeDefined()
    expect(screen.getByRole('link', { name: 'View plans' })).toBeDefined()
  })

  it('links to /plans', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockGetMembership.mockResolvedValue({
      membership: null,
    } as Awaited<ReturnType<typeof getMembership>>)
    const result = await UpgradeMembershipAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/plans')
  })

  it('renders nothing when getMembership fails', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockGetMembership.mockRejectedValue(new Error('API error'))
    const result = await UpgradeMembershipAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })
})
