import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSearchListClient } from '../web-search-list-client'
import type { WebSearchResponseBody } from '@/types/api-responses'

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

vi.mock(import('@/components/web-search/web-search-result-item'), () => ({
  WebSearchResultItem: ({ result }: { result: { url: { url: string } } }) => (
    <div data-testid='web-search-result-item'>{result.url.url}</div>
  ),
}))

const PAGE_INFO = { has_next_page: false, end_cursor: null, start_cursor: null }

const EMPTY_DATA: WebSearchResponseBody = {
  results: [],
  page_info: PAGE_INFO,
}

const mockUrl = {
  __entity_type: 'url' as const,
  id: 'url-1',
  url: 'https://example.com/page',
  pathname: '/page',
  search_params: {},
  canonical_url_id: null,
  hostname: {
    __entity_type: 'hostname' as const,
    id: 'h1',
    hostname: 'example.com',
    topic_id: null,
  },
}

const DATA_WITH_RESULTS: WebSearchResponseBody = {
  results: [{ url: mockUrl, snippet: null, match_type: 'content' }],
  page_info: PAGE_INFO,
}

describe('WebSearchListClient', () => {
  beforeEach(() => {
    mockUsePaginatedList.mockReset()
  })

  it('renders empty state when results are empty', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [EMPTY_DATA],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
      fetchError: null,
      clearError: vi.fn<() => void>(),
    })
    render(
      <WebSearchListClient
        initialData={EMPTY_DATA}
        query='test'
      />,
    )
    expect(screen.getByText('No results found')).toBeTruthy()
  })

  it('renders result items when results are present', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [DATA_WITH_RESULTS],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
      fetchError: null,
      clearError: vi.fn<() => void>(),
    })
    render(
      <WebSearchListClient
        initialData={DATA_WITH_RESULTS}
        query='test'
      />,
    )
    expect(screen.getAllByTestId('web-search-result-item')).toHaveLength(1)
    expect(screen.getByText('https://example.com/page')).toBeTruthy()
  })
})
