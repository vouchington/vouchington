import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import MyChannelsPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyChannelsPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockGetUserRssFeedsCollection.mockReset()
    mockGetUserRssFeedsCollection.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topic_elections: {},
      hostname_elections: {},
    })
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyChannelsPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyChannelsPage())
    expect(screen.getByTestId('bookmark-page-header')).toBeDefined()
  })

  it('calls getUserRssFeedsCollection with video type', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    await MyChannelsPage()
    expect(mockGetUserRssFeedsCollection).toHaveBeenCalledWith(
      baseUser.id,
      'following',
      expect.objectContaining({ feedType: 'video' }),
    )
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetUserRssFeedsCollection.mockResolvedValue({
      results: [
        { id: 'feed-1', topic: { id: 'topic-1' }, hostname: null },
        { id: 'feed-2', topic: { id: 'topic-2' }, hostname: null },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topic_elections: {},
      hostname_elections: {},
      bookmarks: {},
      election_votes: {},
    })
    render(await MyChannelsPage())
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })
})
