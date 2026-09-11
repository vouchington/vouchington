import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { NewsItemList } from '../news-item-list'
import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import type { FeedStyle } from '@/lib/preferences/shared'
import { getPaginatedPage } from '@/lib/api/client'

// Stub dynamic() to render nothing — this test exercises list pagination, not lazy children
vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

// Records every onLoadMore callback passed to InfiniteScroll.
// Use mockReceiveLoadMore.mock.calls.at(-1)![0] after rendering to get the current callback.
const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: React.ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => {
    mockReceiveLoadMore(onLoadMore)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: () => (
    <button
      data-testid='hide-button'
      type='button'
      aria-label='Hide news item'
    />
  ),
}))

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div data-testid='follower-share-actions' />,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

vi.mock(import('@/components/news/news-discuss-menu'), () => ({
  NewsDiscussMenu: () => <div data-testid='news-discuss-menu' />,
}))

function renderWithFeedStyle(ui: React.ReactNode, feedStyle: FeedStyle = 'summary') {
  if (feedStyle !== 'summary') {
    localStorage.setItem('feed-style', feedStyle)
  }
  return render(<FeedStyleProvider>{ui}</FeedStyleProvider>)
}

const makeItem = (id: string, title: string, excerpt: string) =>
  makeRssFeedItem({
    id,
    published_at: '2025-01-15T10:00:00Z',
    data: {
      link: `https://example.com/${id}`,
      guid: `guid-${id}`,
      title,
      contentSnippet: excerpt,
    },
    url: { id: `url-${id}`, url: `https://example.com/${id}` },
    rss_feed: {
      id: 'rss-feed-1',
      title: 'Tech Weekly',
      topic: makeRssFeedItemTopic({
        id: 'topic-1',
        name: 'Technology',
        slug: 'technology',
        topic_type: 'card',
      }),
    },
  })

const makeElection = (id: string) => ({
  __entity_type: 'rss_feed_item_election' as const,
  id,
  votes_score_net: 0,
  votes_count_up: 0,
  votes_count_down: 0,
})

const makeResult = (id: string) => ({
  __entity_type: 'rss_feed_item' as const,
  id,
  published_at: '2025-01-15T10:00:00Z',
  story_id: null,
})

const makePage = (
  itemId: string,
  title: string,
  excerpt: string,
  hasNextPage: boolean,
  endCursor: string | null,
): RssFeedItemsFeedResponseBody => ({
  results: [makeResult(itemId)],
  rss_feed_items: { [itemId]: makeItem(itemId, title, excerpt) },
  rss_feed_item_elections: { [itemId]: makeElection(itemId) },
  page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
})

const mockItem = makeItem('item-1', 'First Article', 'First article excerpt.')

const mockData: RssFeedItemsFeedResponseBody = {
  results: [makeResult('item-1')],
  rss_feed_items: { 'item-1': mockItem },
  rss_feed_item_elections: { 'item-1': makeElection('item-1') },
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('NewsItemList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders all items in results', () => {
    renderWithFeedStyle(<NewsItemList data={mockData} />)
    expect(screen.getByText('First Article')).toBeDefined()
  })

  it('shows empty state when results is empty', () => {
    renderWithFeedStyle(<NewsItemList data={{ ...mockData, results: [], rss_feed_items: {} }} />)
    expect(screen.getByText('No news found')).toBeDefined()
  })

  it('skips rendering a result that has no matching rss_feed_items entry', () => {
    const { container } = renderWithFeedStyle(
      <NewsItemList data={{ ...mockData, rss_feed_items: {} }} />,
    )
    // The InfiniteScroll wrapper renders but contains no NewsItemCard
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(0)
  })

  it('uses entity_id to render shared news rows', () => {
    const sharedData: RssFeedItemsFeedResponseBody = {
      ...mockData,
      results: [{ ...makeResult('share-event-1'), id: 'share-event-1', entity_id: 'item-1' }],
    }

    renderWithFeedStyle(<NewsItemList data={sharedData} />)
    expect(screen.getByText('First Article')).toBeDefined()
  })

  it('passes compact view to NewsItemCard when feedStyle is compact', () => {
    renderWithFeedStyle(<NewsItemList data={mockData} />, 'compact')
    // In compact mode, excerpt is hidden
    expect(screen.queryByText('First article excerpt.')).toBeNull()
    // Title still visible
    expect(screen.getByText('First Article')).toBeDefined()
  })

  it('shows excerpt in summary view', () => {
    renderWithFeedStyle(<NewsItemList data={mockData} />, 'summary')
    expect(screen.getByText('First article excerpt.')).toBeDefined()
  })

  it('accumulates items from the next page when loadMore is triggered', async () => {
    const page1 = makePage('item-1', 'First Article', 'First excerpt.', true, 'cursor1')
    const page2 = makePage('item-2', 'Second Article', 'Second excerpt.', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    renderWithFeedStyle(
      <NewsItemList
        data={page1}
        nextPageEndpoint='/api/v1/rss-feed-items/feed'
        nextPageParams={{ limit: 25 }}
      />,
    )

    expect(screen.getByText('First Article')).toBeDefined()
    expect(screen.queryByText('Second Article')).toBeNull()

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('First Article')).toBeDefined()
    expect(screen.getByText('Second Article')).toBeDefined()
  })

  it('resets accumulated pages when initialData changes (filter/sort update)', async () => {
    const page1 = makePage('item-1', 'First Article', 'First excerpt.', true, 'cursor1')
    const page2 = makePage('item-2', 'Second Article', 'Second excerpt.', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    const { rerender } = renderWithFeedStyle(
      <NewsItemList
        data={page1}
        nextPageEndpoint='/api/v1/rss-feed-items/feed'
        nextPageParams={{ limit: 25 }}
      />,
    )

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })
    expect(screen.getByText('First Article')).toBeDefined()
    expect(screen.getByText('Second Article')).toBeDefined()

    const newData = makePage('item-3', 'New Filter Article', 'New excerpt.', false, null)
    rerender(
      <FeedStyleProvider>
        <NewsItemList
          data={newData}
          nextPageEndpoint='/api/v1/rss-feed-items/feed'
          nextPageParams={{ limit: 25 }}
        />
      </FeedStyleProvider>,
    )

    expect(screen.queryByText('First Article')).toBeNull()
    expect(screen.queryByText('Second Article')).toBeNull()
    expect(screen.getByText('New Filter Article')).toBeDefined()
  })

  it('preserves accumulated pages when rerendered with same page_info but new object reference', async () => {
    const page1 = makePage('item-1', 'First Article', 'First excerpt.', true, 'cursor1')
    const page2 = makePage('item-2', 'Second Article', 'Second excerpt.', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    const { rerender } = renderWithFeedStyle(
      <NewsItemList
        data={page1}
        nextPageEndpoint='/api/v1/rss-feed-items/feed'
        nextPageParams={{ limit: 25 }}
      />,
    )

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })
    expect(screen.getByText('First Article')).toBeDefined()
    expect(screen.getByText('Second Article')).toBeDefined()

    // Rerender with a structurally identical page_info but a new object reference —
    // simulates a server re-render triggered by modal navigation (?rss_item= changing).
    const sameDataNewRef = makePage('item-1', 'First Article', 'First excerpt.', true, 'cursor1')
    rerender(
      <FeedStyleProvider>
        <NewsItemList
          data={sameDataNewRef}
          nextPageEndpoint='/api/v1/rss-feed-items/feed'
          nextPageParams={{ limit: 25 }}
        />
      </FeedStyleProvider>,
    )

    // Both pages must still be visible — the same fingerprint must not trigger a reset.
    expect(screen.getByText('First Article')).toBeDefined()
    expect(screen.getByText('Second Article')).toBeDefined()
  })
})
