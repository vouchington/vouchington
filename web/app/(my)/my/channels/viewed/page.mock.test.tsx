import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser, mockUserViewedRssFeedRoute } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockUserViewedRssFeedRoute: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/components/users/user-relation-route-pages'), () => ({
  UserViewedRssFeedRoute: mockUserViewedRssFeedRoute,
}))
vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))

import MyChannelsViewedPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyChannelsViewedPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockUserViewedRssFeedRoute.mockReset()
    mockUserViewedRssFeedRoute.mockReturnValue(<div data-testid='rss-feed-viewed-route' />)
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyChannelsViewedPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyChannelsViewedPage())
    expect(screen.getByTestId('bookmark-page-header')).toBeDefined()
  })

  it('renders UserViewedRssFeedRoute with video feedType', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyChannelsViewedPage())
    expect(mockUserViewedRssFeedRoute.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ feedType: 'video' }),
    )
  })
})
