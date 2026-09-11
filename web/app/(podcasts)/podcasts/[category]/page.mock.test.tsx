import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastCategoryPage, { generateMetadata } from './page'
import type { ViewRssFeed } from '@/types/rss-feeds'

interface HeaderBag {
  get: (key: string) => string | null
}

const { mockGetRssFeeds, mockGetListSearchErrorMessage, mockGetCurrentUser, mockHeaders } =
  vi.hoisted(() => ({
    mockGetRssFeeds: vi.fn<VitestLooseMock>(),
    mockGetListSearchErrorMessage: vi.fn<VitestLooseMock>().mockReturnValue(null),
    mockGetCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
    mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
  }))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: mockHeaders,
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server/rss-feeds'), () => ({
  getRssFeeds: mockGetRssFeeds,
}))

vi.mock(
  import('@/lib/api/list-search-error'),
  () =>
    ({
      getListSearchErrorMessage: mockGetListSearchErrorMessage,
      isListSearchErrorResult: (v: unknown) =>
        v != null &&
        typeof v === 'object' &&
        'error' in v &&
        typeof (v as { error: unknown }).error === 'string',
    }) as unknown as typeof import('@/lib/api/list-search-error'),
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
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => <p data-pw='search-error'>{message}</p>,
}))

vi.mock(import('@/components/podcasts/podcast-show-card'), () => ({
  PodcastShowCard: ({ feed }: { feed: ViewRssFeed }) => (
    <article data-pw='podcast-show-card'>{feed.title}</article>
  ),
}))

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: ViewRssFeed }) => (
    <div
      data-testid='rss-feed-list-item'
      data-pw='rss-feed-list-item'
    >
      {feed.title}
    </div>
  ),
}))

function makeEmptyResponse() {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}

function makeFeedResponse(feeds: Partial<ViewRssFeed>[]) {
  const results = feeds.map((f, i) => ({
    __entity_type: 'rss_feed' as const,
    id: `feed-${i}`,
    title: f.title ?? `Podcast ${i}`,
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'podcast' as const,
    rss_feed_url: { id: `url-${i}`, url: 'https://example.com/feed.xml' },
    home_page_url: null,
    topic: {
      id: `topic-${i}`,
      name: f.title ?? `Podcast ${i}`,
      slug: `podcast-${i}`,
      topic_type: 'rss_feed',
    },
    ...f,
  }))
  return {
    results,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}

describe('PodcastCategoryPage', () => {
  beforeEach(() => {
    mockGetRssFeeds.mockReset()
    mockGetRssFeeds.mockResolvedValue(makeEmptyResponse())
    mockHeaders.mockResolvedValue({ get: () => null })
  })

  it('renders the category display name in the header', async () => {
    const ui = await PodcastCategoryPage({
      params: Promise.resolve({ category: 'technology' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(screen.getByText('Technology Podcasts')).toBeDefined()
  })

  it('calls getRssFeeds with the category slug', async () => {
    await PodcastCategoryPage({
      params: Promise.resolve({ category: 'business' }),
      searchParams: Promise.resolve({}),
    })
    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ category: 'business', feed_type: 'podcast' }),
    })
  })

  it('renders podcast show cards for each result', async () => {
    mockGetRssFeeds.mockResolvedValue(makeFeedResponse([{ title: 'Tech Podcast' }]))
    const ui = await PodcastCategoryPage({
      params: Promise.resolve({ category: 'technology' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(screen.getByText('Tech Podcast')).toBeDefined()
  })

  it('shows an empty state when no podcasts found in category', async () => {
    const ui = await PodcastCategoryPage({
      params: Promise.resolve({ category: 'technology' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(screen.getByText('No Technology podcasts found')).toBeDefined()
  })

  it('capitalizes hyphenated category names correctly', async () => {
    const ui = await PodcastCategoryPage({
      params: Promise.resolve({ category: 'true-crime' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(screen.getByText('True Crime Podcasts')).toBeDefined()
  })

  it('passes q search param to getRssFeeds', async () => {
    await PodcastCategoryPage({
      params: Promise.resolve({ category: 'news' }),
      searchParams: Promise.resolve({ q: 'daily' }),
    })
    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ q: 'daily' }),
    })
  })

  it('shows a search error when getRssFeeds rejects with a recognisable error', async () => {
    mockGetRssFeeds.mockRejectedValue(new Error('bad request'))
    mockGetListSearchErrorMessage.mockReturnValue('Invalid search parameters')
    const ui = await PodcastCategoryPage({
      params: Promise.resolve({ category: 'technology' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(screen.getByText('Invalid search parameters')).toBeDefined()
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    mockGetRssFeeds.mockResolvedValue(
      makeFeedResponse([{ title: 'Tech Cast' }, { title: 'Dev Talk' }]),
    )
    const ui = await PodcastCategoryPage({
      params: Promise.resolve({ category: 'technology' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })
})

describe('generateMetadata', () => {
  it('builds a title from the category slug', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ category: 'technology' }),
      searchParams: Promise.resolve({}),
    })
    expect(meta).toMatchObject({ title: expect.stringContaining('Technology') })
  })

  it('capitalises hyphenated category slugs in the metadata title', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ category: 'true-crime' }),
      searchParams: Promise.resolve({}),
    })
    expect(meta).toMatchObject({ title: expect.stringContaining('True Crime') })
  })
})
