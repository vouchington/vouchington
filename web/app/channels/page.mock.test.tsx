import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetRssFeeds, mockGetListSearchErrorMessage, mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetRssFeeds: vi.fn<VitestLooseMock>(),
  mockGetListSearchErrorMessage: vi.fn<VitestLooseMock>().mockReturnValue(null),
  mockGetCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/lib/api/server/rss-feeds'), () => ({
  getRssFeeds: mockGetRssFeeds,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
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
  createItemListSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
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

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { title?: string | null } }) => (
    <div
      data-testid='rss-feed-list-item'
      data-pw='rss-feed-list-item'
    >
      {feed.title}
    </div>
  ),
}))

vi.mock(import('@/components/sources/add-source-button'), () => ({
  AddSourceButton: () => <button type='button'>mock-add-source</button>,
}))

import ChannelsPage from './page'

function makeFeedResponse(feeds: { title?: string | null }[]) {
  const results = feeds.map((f, i) => ({
    id: `feed-${i}`,
    title: f.title ?? `Channel ${i}`,
    topic: { id: `topic-${i}` },
    hostname: null,
    rss_feed_url: { id: `url-${i}`, url: 'https://example.com/feed.xml' },
    home_page_url: null,
  }))
  return {
    results,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
    bookmarks: {},
    election_votes: {},
  }
}

function makeEmptyResponse() {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
    bookmarks: {},
    election_votes: {},
  }
}

describe('ChannelsPage', () => {
  beforeEach(() => {
    mockGetRssFeeds.mockReset()
    mockGetRssFeeds.mockResolvedValue(makeEmptyResponse())
    mockGetCurrentUser.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
  })

  it('renders the page header', async () => {
    const ui = await ChannelsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Channels')).toBeDefined()
  })

  it('calls getRssFeeds with feed_type=video', async () => {
    await ChannelsPage({ searchParams: Promise.resolve({}) })
    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ feed_type: 'video' }),
    })
  })

  it('shows empty state when no channels found', async () => {
    const ui = await ChannelsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('No channels found')).toBeDefined()
  })

  it('shows search error when getRssFeeds rejects with a recognisable error', async () => {
    mockGetRssFeeds.mockRejectedValue(new Error('bad request'))
    mockGetListSearchErrorMessage.mockReturnValue('Invalid search parameters')
    const ui = await ChannelsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Invalid search parameters')).toBeDefined()
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    mockGetRssFeeds.mockResolvedValue(
      makeFeedResponse([{ title: 'Channel A' }, { title: 'Channel B' }]),
    )
    const ui = await ChannelsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })
})
