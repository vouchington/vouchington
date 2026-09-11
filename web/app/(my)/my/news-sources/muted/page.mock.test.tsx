import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser, mockUserRssFeedRelationRoute } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockUserRssFeedRelationRoute: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/components/users/user-relation-route-pages'), () => ({
  UserRssFeedRelationRoute: mockUserRssFeedRelationRoute,
}))
vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))

import MyNewsSourcesMutedPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyNewsSourcesMutedPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockUserRssFeedRelationRoute.mockReset()
    mockUserRssFeedRelationRoute.mockReturnValue(<div data-testid='rss-feed-relation-route' />)
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyNewsSourcesMutedPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyNewsSourcesMutedPage())
    expect(screen.getByTestId('bookmark-page-header')).toBeDefined()
  })

  it('renders UserRssFeedRelationRoute with article feedType', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyNewsSourcesMutedPage())
    expect(mockUserRssFeedRelationRoute.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ feedType: 'article' }),
    )
  })
})
