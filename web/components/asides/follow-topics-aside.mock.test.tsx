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
  followsAnyTopic: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/dismissible-aside'), () => ({
  DismissibleAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { followsAnyTopic } from '@/lib/asides/activity-signals'
import { FollowTopicsAside } from './follow-topics-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockFollowsAnyTopic = vi.mocked(followsAnyTopic)

describe('FollowTopicsAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await FollowTopicsAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when user already follows topics', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockFollowsAnyTopic.mockResolvedValue(true)
    const result = await FollowTopicsAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders follow topics nudge when user has not followed any topic', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockFollowsAnyTopic.mockResolvedValue(false)
    const result = await FollowTopicsAside()
    render(result as ReactElement)
    expect(screen.getByText('Follow topics')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Browse topics' })).toBeDefined()
  })

  it('links to /topics', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockFollowsAnyTopic.mockResolvedValue(false)
    const result = await FollowTopicsAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: 'Browse topics' }).getAttribute('href')).toBe('/topics')
  })
})
