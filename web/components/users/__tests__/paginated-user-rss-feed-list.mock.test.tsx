import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RssFeedsListResponseBody } from '@/types/api-responses'
import type { ViewRssFeed } from '@/types/rss-feeds'
import { getPaginatedPage } from '@/lib/api/client'
import { PaginatedUserRssFeedList } from '../paginated-user-rss-feed-list'

const { receiveLoadMore } = vi.hoisted(() => ({
  receiveLoadMore: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    clearError,
    fetchError,
    onLoadMore,
  }: React.PropsWithChildren<{
    clearError?: () => void
    fetchError?: Error | null
    onLoadMore: () => void
  }>) => {
    receiveLoadMore(onLoadMore)
    return (
      <div>
        {children}
        {fetchError ? (
          <button
            type='button'
            onClick={() => {
              clearError?.()
              onLoadMore()
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  },
}))

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { id: string } }) => <div>{feed.id}</div>,
}))

function makeFeed(id: string): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id,
    title: id,
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'podcast',
    rss_feed_url: { id: `${id}-url`, url: 'https://example.com/feed.xml' },
    home_page_url: null,
    hostname: null,
    topic: { id: `${id}-topic`, name: 'Topic', slug: 'topic', topic_type: 'rss_feed' },
  }
}

function makePage(
  ids: string[],
  {
    endCursor = null,
    hasNextPage = false,
  }: { endCursor?: string | null; hasNextPage?: boolean } = {},
): RssFeedsListResponseBody {
  return {
    results: ids.map(id => makeFeed(id)),
    page_info: {
      end_cursor: endCursor,
      has_next_page: hasNextPage,
      start_cursor: null,
    },
    topic_elections: {},
    hostname_elections: {},
    election_votes: {},
    bookmarks: {},
  }
}

describe('PaginatedUserRssFeedList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the next page when the current page is empty but has a continuation', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['feed-2']))

    render(
      <PaginatedUserRssFeedList
        initialData={makePage([], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/rss-feeds/following'
        params={{ feed_type: 'podcast' }}
        emptyTitle='No followed podcasts'
        emptyDescription='You are not following any podcasts yet.'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/users/alice/rss-feeds/following', {
      after: 'cursor-1',
      feed_type: 'podcast',
    })
    expect(await screen.findByText('feed-2')).toBeDefined()
  })

  it('shows the empty state when there is no continuation', () => {
    render(
      <PaginatedUserRssFeedList
        initialData={makePage([])}
        endpoint='/api/v1/users/alice/rss-feeds/following'
        emptyTitle='No followed podcasts'
        emptyDescription='You are not following any podcasts yet.'
      />,
    )

    expect(screen.getByText('No followed podcasts')).toBeDefined()
    expect(receiveLoadMore).not.toHaveBeenCalled()
  })
})
