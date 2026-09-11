import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/asides/activity-signals'), () => ({
  hasJoinedCommunity: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/asides/popular-communities-aside'),
  () =>
    ({
      PopularCommunitiesAside: () => <div data-testid='popular-communities-aside'>Communities</div>,
    }) as unknown as typeof import('@/components/asides/popular-communities-aside'),
)

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasJoinedCommunity } from '@/lib/asides/activity-signals'
import { DiscoverCommunitiesAside } from './discover-communities-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHasJoinedCommunity = vi.mocked(hasJoinedCommunity)

describe('DiscoverCommunitiesAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await DiscoverCommunitiesAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when user is already a community member', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockHasJoinedCommunity.mockResolvedValue(true)
    const result = await DiscoverCommunitiesAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders popular communities when user has not joined any community', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockHasJoinedCommunity.mockResolvedValue(false)
    const result = await DiscoverCommunitiesAside()
    render(result as ReactElement)
    expect(screen.getByTestId('popular-communities-aside')).toBeDefined()
  })
})
