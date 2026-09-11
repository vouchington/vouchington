import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))
vi.mock(import('@/components/my/rss-bookmark-type-filter'), () => ({
  RssBookmarkTypeFilter: () => <div />,
}))
vi.mock(
  import('@/components/users/user-relation-route-pages'),
  () =>
    ({
      UserSavedRssFeedItemsRoute: () => <div data-pw='user-saved-items' />,
      UserHiddenRssFeedItemsRoute: () => <div data-pw='user-hidden-items' />,
      UserViewedRssFeedItemsRoute: () => <div data-pw='user-viewed-items' />,
    }) as unknown as typeof import('@/components/users/user-relation-route-pages'),
)

import MyVideosSavedPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyVideosSavedPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyVideosSavedPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/login',
    )
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyVideosSavedPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('bookmark-page-header')).toBeDefined()
  })
})
