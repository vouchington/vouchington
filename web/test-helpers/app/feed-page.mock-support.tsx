import type { ReactNode } from 'react'
import { vi } from 'vitest'

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
  import('@/lib/api/list-search-error'),
  () =>
    ({
      getListSearchErrorMessage: vi.fn<VitestLooseMock>().mockReturnValue(null),
      isListSearchErrorResult: (value: unknown) =>
        value != null &&
        typeof value === 'object' &&
        'error' in value &&
        typeof (value as { error: unknown }).error === 'string',
    }) as unknown as typeof import('@/lib/api/list-search-error'),
)

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
      NewsItemClusterList: ({ children }: { children: ReactNode }) => (
        <div data-pw='news-item-cluster-list'>{children}</div>
      ),
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
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(import('@/components/sources/add-source-button'), () => ({
  AddSourceButton: () => (
    // ast-grep-ignore: web-no-raw-form-elements -- test double replaces AddSourceButton with a button the feed page tests query
    <button type='button'>mock-add-source</button>
  ),
}))

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => <p data-pw='search-error'>{message}</p>,
}))

function makeEmptyFeedPageResponse() {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    rss_feed_items: {},
    rss_feed_item_elections: {},
  }
}

function resetFeedPageDoubles() {
  mockGetCurrentUser.mockReset()
  mockGetRssFeedItems.mockReset()
  mockGetCurrentUser.mockResolvedValue(null)
  mockGetRssFeedItems.mockResolvedValue(makeEmptyFeedPageResponse())
}

export { mockGetRssFeedItems, resetFeedPageDoubles }
