import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicLatestPage } from './topic-latest-page'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

const { mockGetRssFeedItems } = vi.hoisted(() => ({
  mockGetRssFeedItems: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getRssFeedItems: mockGetRssFeedItems,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(
  import('@/components/feed/news-item-list'),
  () =>
    ({
      NewsItemList: ({
        nextPageEndpoint,
        nextPageParams,
        children,
      }: {
        data: RssFeedItemsFeedResponseBody
        nextPageEndpoint: string
        nextPageParams: Record<string, string | number>
        children?: React.ReactNode
      }) => (
        <div>
          <div>news list</div>
          <div>{nextPageEndpoint}</div>
          <div>{JSON.stringify(nextPageParams)}</div>
          {children}
        </div>
      ),
    }) as unknown as typeof import('@/components/feed/news-item-list'),
)

vi.mock(
  import('@/components/rss-feed-items/rss-feed-item-modal'),
  () =>
    ({
      RssFeedItemModal: ({
        pathname,
        searchParams,
      }: {
        pathname: string
        searchParams: Record<string, string | string[] | undefined>
      }) => <div>{`modal:${pathname}:${JSON.stringify(searchParams)}`}</div>,
    }) as unknown as typeof import('@/components/rss-feed-items/rss-feed-item-modal'),
)

describe('TopicLatestPage', () => {
  beforeEach(() => {
    mockGetRssFeedItems.mockReset()
    mockGetRssFeedItems.mockResolvedValue({
      results: [],
      page_info: {
        has_next_page: false,
        end_cursor: null,
        start_cursor: null,
      },
      rss_feed_items: {},
      rss_feed_item_elections: {},
    } satisfies RssFeedItemsFeedResponseBody)
  })

  it('fetches latest by topic (items from this topic source)', async () => {
    const ui = await TopicLatestPage({
      id: 'topic-1',
      pathname: '/topic/topic-1/latest',
      searchParams: { rss_item: 'feed-1:test-guid-1' },
    })
    render(ui)

    expect(mockGetRssFeedItems).toHaveBeenCalledWith({
      searchParams: {
        topic: 'topic-1',
        limit: 25,
      },
    })
    expect(screen.getByText('news list')).toBeDefined()
    expect(screen.getByText('/api/v1/rss-feed-items')).toBeDefined()
    expect(screen.getByText(JSON.stringify({ topic: 'topic-1', limit: 25 }))).toBeDefined()
    expect(
      screen.getByText('modal:/topic/topic-1/latest:{"rss_item":"feed-1:test-guid-1"}'),
    ).toBeDefined()
  })
})
