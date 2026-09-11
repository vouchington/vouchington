import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedNewsListPage } from '../feed-news-list-page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

const { mockGetRssFeedItemsFeed } = vi.hoisted(() => ({
  mockGetRssFeedItemsFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getRssFeedItemsFeed: mockGetRssFeedItemsFeed,
}))

vi.mock(import('../feed-top-section'), () => ({
  FeedTopSection: ({ filters, viewToggle }: { filters: ReactNode; viewToggle: ReactNode }) => (
    <div>
      feed top section
      {filters}
      {viewToggle}
    </div>
  ),
}))

vi.mock(import('../feed-view-toggle'), () => ({
  FeedViewToggle: () => <div>feed view toggle</div>,
}))

vi.mock(import('@/components/news/news-filters'), () => ({
  NewsFilters: () => <div>news filters</div>,
}))

vi.mock(
  import('@/components/news/news-item-cluster-list'),
  () =>
    ({
      NewsItemClusterList: ({
        nextPageParams,
      }: {
        data: RssFeedItemsFeedResponseBody
        nextPageParams: Record<string, string | number>
      }) => <div>{JSON.stringify(nextPageParams)}</div>,
    }) as unknown as typeof import('@/components/news/news-item-cluster-list'),
)

vi.mock(
  import('@/components/rss-feed-items/rss-feed-item-modal'),
  () =>
    ({
      RssFeedItemModal: () => <div>rss item modal</div>,
    }) as unknown as typeof import('@/components/rss-feed-items/rss-feed-item-modal'),
)

const feedResponse: RssFeedItemsFeedResponseBody = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  rss_feed_items: {},
  rss_feed_item_elections: {},
}

describe('FeedNewsListPage', () => {
  beforeEach(() => {
    mockGetRssFeedItemsFeed.mockReset()
    mockGetRssFeedItemsFeed.mockResolvedValue(feedResponse)
  })

  it('does not pass community scope to friends-only news', async () => {
    const ui = await FeedNewsListPage({
      config: feedRouteConfigs['news/friends'],
      searchParams: { community: 'source-list' },
    })

    render(ui)

    expect(mockGetRssFeedItemsFeed).toHaveBeenCalledWith('follow_users', {
      searchParams: { limit: 25, media_type: 'article' },
    })
    expect(screen.getByText(JSON.stringify({ limit: 25, media_type: 'article' }))).toBeDefined()
    expect(screen.getByText('news filters')).toBeDefined()
  })

  it('does not pass community scope to source news', async () => {
    const ui = await FeedNewsListPage({
      config: feedRouteConfigs['news/sources'],
      searchParams: { community: 'source-list' },
    })

    render(ui)

    expect(mockGetRssFeedItemsFeed).toHaveBeenCalledWith('follow_rss_feeds', {
      searchParams: { limit: 25, media_type: 'article' },
    })
    expect(screen.getByText(JSON.stringify({ limit: 25, media_type: 'article' }))).toBeDefined()
  })

  it('passes search query to source news', async () => {
    await FeedNewsListPage({
      config: feedRouteConfigs['news/sources'],
      searchParams: { q: 'travel #awards' },
    })

    expect(mockGetRssFeedItemsFeed).toHaveBeenCalledWith('follow_rss_feeds', {
      searchParams: { limit: 25, q: 'travel #awards', media_type: 'article' },
    })
  })

  it('passes media_type=audio for podcasts feed', async () => {
    await FeedNewsListPage({
      config: feedRouteConfigs['podcasts'],
      searchParams: {},
    })

    expect(mockGetRssFeedItemsFeed).toHaveBeenCalledWith('any', {
      searchParams: { limit: 25, media_type: 'audio' },
    })
  })

  it('passes media_type=video for videos feed', async () => {
    await FeedNewsListPage({
      config: feedRouteConfigs['videos'],
      searchParams: {},
    })

    expect(mockGetRssFeedItemsFeed).toHaveBeenCalledWith('any', {
      searchParams: { limit: 25, media_type: 'video' },
    })
  })

  it('passes media_type=article for news feed', async () => {
    await FeedNewsListPage({
      config: feedRouteConfigs['news'],
      searchParams: {},
    })

    expect(mockGetRssFeedItemsFeed).toHaveBeenCalledWith('any', {
      searchParams: { limit: 25, media_type: 'article' },
    })
  })
})
