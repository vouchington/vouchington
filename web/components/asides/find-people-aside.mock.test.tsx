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
  followsAnyUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/dismissible-aside'), () => ({
  DismissibleAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { followsAnyUser } from '@/lib/asides/activity-signals'
import { FindPeopleAside } from './find-people-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockFollowsAnyUser = vi.mocked(followsAnyUser)

describe('FindPeopleAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await FindPeopleAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when user already follows someone', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockFollowsAnyUser.mockResolvedValue(true)
    const result = await FindPeopleAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders find people nudge when user follows no one', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockFollowsAnyUser.mockResolvedValue(false)
    const result = await FindPeopleAside()
    render(result as ReactElement)
    expect(screen.getByText('Find people to follow')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Discover people' })).toBeDefined()
  })

  it('links to /users', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockFollowsAnyUser.mockResolvedValue(false)
    const result = await FindPeopleAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: 'Discover people' }).getAttribute('href')).toBe(
      '/users',
    )
  })
})
