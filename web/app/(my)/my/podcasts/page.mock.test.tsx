import { describe, expect, it, vi } from 'vitest'
import { registerFollowedRssFeedPageTests } from '@/test-helpers/app/my/followed-rss-feed-page'

const { mockRequireCurrentUser, mockGetUserRssFeedsCollection } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetUserRssFeedsCollection: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getUserRssFeedsCollection: mockGetUserRssFeedsCollection,
}))

vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: () => <div data-testid='rss-feed-list-item' />,
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('@/components/sources/add-source-button'), () => ({
  AddSourceButton: () => <button type='button'>mock-add-source</button>,
}))

import MyPodcastsPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyPodcastsPage', () => {
  registerFollowedRssFeedPageTests({
    loadPage: () => MyPodcastsPage(),
    requireCurrentUser: mockRequireCurrentUser,
    getUserRssFeedsCollection: mockGetUserRssFeedsCollection,
  })

  it('calls getUserRssFeedsCollection with podcast type', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    await MyPodcastsPage()
    expect(mockGetUserRssFeedsCollection).toHaveBeenCalledWith(
      baseUser.id,
      'following',
      expect.objectContaining({ feedType: 'podcast' }),
    )
  })
})
