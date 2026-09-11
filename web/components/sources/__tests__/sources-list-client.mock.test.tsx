import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcesListClient } from '../sources-list-client'
import type { RssFeedsListResponseBody } from '@/types/api-responses'

const { mockUsePaginatedList } = vi.hoisted(() => ({
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/shared/paginated-list-footer'), () => ({
  PaginatedListFooter: () => null,
}))

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { title: string } }) => (
    <li data-testid='source-list-item'>{feed.title}</li>
  ),
}))

const PAGE_INFO = { has_next_page: false, end_cursor: null, start_cursor: null }

const EMPTY_DATA: RssFeedsListResponseBody = {
  results: [],
  page_info: PAGE_INFO,
  topic_elections: {},
  hostname_elections: {},
}

const FEED_1 = {
  __entity_type: 'rss_feed' as const,
  id: 'feed-1',
  title: 'Feed One',
  is_enabled: true,
  is_discoverable: true,
  etag: null,
  last_modified_at: null,
  last_fetched_at: null,
  feed_type: 'article' as const,
  rss_feed_url: {
    id: 'url-1',
    url: 'https://feedone.com/feed.xml',
    hostname: { id: 'h1', hostname: 'feedone.com' },
  },
  home_page_url: { url: 'https://feedone.com' },
  hostname: {
    __entity_type: 'hostname' as const,
    id: 'h1',
    hostname: 'feedone.com',
    topic_id: null,
  },
  topic: { id: 't1', name: 'Topic 1', slug: 'topic-1', topic_type: 'default' },
}

const DATA_WITH_RESULTS: RssFeedsListResponseBody = {
  results: [FEED_1],
  page_info: PAGE_INFO,
  topic_elections: {},
  hostname_elections: {},
  bookmarks: { 'feed-1': { follow: true } },
}

describe('SourcesListClient', () => {
  beforeEach(() => {
    mockUsePaginatedList.mockReset()
  })

  it('renders no items when results are empty', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [EMPTY_DATA],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
      fetchError: null,
      clearError: vi.fn<() => void>(),
    })
    render(
      <SourcesListClient
        initialData={EMPTY_DATA}
        searchParams={{}}
      />,
    )
    expect(screen.queryAllByTestId('source-list-item')).toHaveLength(0)
  })

  it('renders a feed item from the first page', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [DATA_WITH_RESULTS],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
      fetchError: null,
      clearError: vi.fn<() => void>(),
    })
    render(
      <SourcesListClient
        initialData={DATA_WITH_RESULTS}
        searchParams={{ q: 'fintech' }}
      />,
    )
    expect(screen.getByTestId('source-list-item')).toBeDefined()
    expect(screen.getByText('Feed One')).toBeVisible()
  })
})
