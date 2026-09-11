import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NewsPage from './page'

const { mockGetCurrentUser, mockGetRssFeedItems } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetRssFeedItems: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getRssFeedItems: mockGetRssFeedItems,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(
  import('@/components/asides/discovery-asides'),
  () =>
    ({
      DiscoveryAsides: () => null,
    }) as unknown as typeof import('@/components/asides/discovery-asides'),
)

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createItemListSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/news/news-filters'), () => ({
  NewsFilters: () => <div>news filters</div>,
}))

vi.mock(import('@/components/feed/feed-view-toggle'), () => ({
  FeedViewToggle: () => <div>feed view toggle</div>,
}))

vi.mock(
  import('@/components/news/news-item-cluster-list'),
  () =>
    ({
      NewsItemClusterList: ({
        nextPageParams,
      }: {
        nextPageParams: Record<string, string | number>
      }) => <div>{JSON.stringify(nextPageParams)}</div>,
    }) as unknown as typeof import('@/components/news/news-item-cluster-list'),
)

vi.mock(
  import('@/components/rss-feed-items/rss-feed-item-modal'),
  () =>
    ({
      RssFeedItemModal: () => null,
    }) as unknown as typeof import('@/components/rss-feed-items/rss-feed-item-modal'),
)

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: () => <h1>News</h1>,
}))

vi.mock(import('@/components/sources/add-source-button'), () => ({
  AddSourceButton: () => <button type='button'>mock-add-source</button>,
}))

describe('NewsPage', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset()
    mockGetRssFeedItems.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetRssFeedItems.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      rss_feed_items: {},
      rss_feed_item_elections: {},
    })
  })

  it('renders the feed view toggle on the news page', async () => {
    const ui = await NewsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('feed view toggle')).toBeDefined()
  })

  it('renders the page heading', async () => {
    const ui = await NewsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('News')).toBeDefined()
  })

  it('preserves legacy topics query params for bookmarked news URLs', async () => {
    await NewsPage({
      searchParams: Promise.resolve({ q: 'travel', topics: 'topic-1,topic-2' }),
    })

    expect(mockGetRssFeedItems).toHaveBeenCalledWith({
      searchParams: {
        q: 'travel',
        topics: 'topic-1,topic-2',
        media_type: 'article',
        limit: 25,
      },
    })
  })

  it('preserves repeated legacy topics query params for bookmarked news URLs', async () => {
    await NewsPage({
      searchParams: Promise.resolve({ topics: ['topic-1', 'topic-2'] }),
    })

    expect(mockGetRssFeedItems).toHaveBeenCalledWith({
      searchParams: {
        topics: 'topic-1,topic-2',
        media_type: 'article',
        limit: 25,
      },
    })
  })
})
