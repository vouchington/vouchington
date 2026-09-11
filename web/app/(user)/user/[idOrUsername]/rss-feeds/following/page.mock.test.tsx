import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUserRssFeedsCollection, mockNotFound } = vi.hoisted(() => ({
  mockGetUserRssFeedsCollection: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getUserRssFeedsCollection: mockGetUserRssFeedsCollection,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ robots: { index: false } })),
}))

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { id: string; title?: string | null } }) => (
    <div
      data-testid='rss-feed-list-item'
      data-pw='rss-feed-list-item'
    >
      {feed.id}
    </div>
  ),
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

import UserFollowingRssFeedsRoute from './page'

function makeRssFeedsData(feedIds: string[]) {
  return {
    results: feedIds.map(id => ({
      id,
      topic: { id: `topic-${id}` },
      hostname: null,
    })),
    bookmarks: {},
    topic_elections: {},
    hostname_elections: {},
    election_votes: {},
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

describe('UserFollowingRssFeedsRoute', () => {
  beforeEach(() => {
    mockGetUserRssFeedsCollection.mockReset()
    mockNotFound.mockReset()
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('calls notFound when getUserRssFeedsCollection returns null', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(null)
    await expect(
      UserFollowingRssFeedsRoute({
        params: Promise.resolve({ idOrUsername: 'alice' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders empty state when results are empty', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(makeRssFeedsData([]))
    const result = await UserFollowingRssFeedsRoute({
      params: Promise.resolve({ idOrUsername: 'alice' }),
      searchParams: Promise.resolve({}),
    })
    render(result)
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('No followed sources')).toBeDefined()
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(makeRssFeedsData(['feed-1', 'feed-2']))
    const result = await UserFollowingRssFeedsRoute({
      params: Promise.resolve({ idOrUsername: 'alice' }),
      searchParams: Promise.resolve({}),
    })
    render(result)
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })

  it('renders a single RssFeedListItem carrying its feed id for a different idOrUsername', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(makeRssFeedsData(['feed-1']))
    const result = await UserFollowingRssFeedsRoute({
      params: Promise.resolve({ idOrUsername: 'bob' }),
      searchParams: Promise.resolve({}),
    })
    render(result)
    expect(screen.getByTestId('rss-feed-list-item')).toHaveTextContent('feed-1')
  })
})
