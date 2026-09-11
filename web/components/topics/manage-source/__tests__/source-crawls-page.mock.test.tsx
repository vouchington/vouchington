import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import { SourceCrawlsPage, type SourceCrawlSummary } from '../source-crawls-page'

type InfiniteScrollProps = Parameters<
  typeof import('@/components/shared/infinite-scroll').InfiniteScroll
>[0]
type RecordedInfiniteScrollProps = Omit<InfiniteScrollProps, 'children'>

const { mockInfiniteScrollProps, mockLoadMore, mockTranslate, mockUsePaginatedList } = vi.hoisted(
  () => ({
    mockInfiniteScrollProps: vi.fn<(props: RecordedInfiniteScrollProps) => void>(),
    mockLoadMore: vi.fn<() => Promise<void>>(),
    mockTranslate: vi.fn<VitestLooseMock>((key: string) => key),
    mockUsePaginatedList: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children, ...props }: InfiniteScrollProps) => {
    mockInfiniteScrollProps(props)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/i18n/use-translations'), () => ({ useTranslations: () => mockTranslate }))

function makePage(
  results: SourceCrawlSummary[],
  pageInfo: Partial<ListResponse<SourceCrawlSummary>['page_info']> = {},
): ListResponse<SourceCrawlSummary> {
  return {
    results,
    page_info: {
      has_next_page: false,
      start_cursor: results[0]?.id ?? null,
      end_cursor: null,
      ...pageInfo,
    },
  }
}

describe('SourceCrawlsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadMore.mockResolvedValue(undefined)
  })

  it('uses the source crawl endpoint with the SSR page and forwards continuation state', () => {
    const initialPage = makePage(
      [{ id: 'crawl-1', response_code: 200, created_at: '2026-08-17T00:00:00.000Z' }],
      { has_next_page: true, end_cursor: 'source-crawl-cursor' },
    )
    const resetKey = Symbol('source-crawls-reset')
    mockUsePaginatedList.mockReturnValue({
      pages: [initialPage],
      hasNextPage: true,
      endCursor: 'source-crawl-cursor',
      loadMore: mockLoadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey,
    })

    render(
      <SourceCrawlsPage
        data={initialPage}
        rssFeedId='feed-1'
        topic={{ id: 'topic-1', slug: 'source-slug', topic_type: 'rss_feed' }}
      />,
    )

    expect(mockUsePaginatedList).toHaveBeenCalledWith(
      initialPage,
      '/api/v1/rss-feeds/feed-1/crawls',
      { limit: 20 },
    )
    expect(mockInfiniteScrollProps).toHaveBeenCalledWith(
      expect.objectContaining({
        hasNextPage: true,
        endCursor: 'source-crawl-cursor',
        onLoadMore: mockLoadMore,
        resetKey,
      }),
    )
    expect(
      screen.getByRole('link', {
        name: 'extracted.manageSource.crawlHistorySection.viewCrawlFromDate_73e55b54',
      }),
    ).toHaveAttribute('href', '/source/source-slug/crawls/crawl-1')

    expect(mockTranslate).toHaveBeenCalledWith(
      'extracted.manageSource.crawlHistorySection.timestamp_115a2cc9',
    )
    expect(mockTranslate).toHaveBeenCalledWith(
      'extracted.manageSource.crawlHistorySection.responseCode_c7992dd3',
    )
  })

  it('localizes the empty state', () => {
    const initialPage = makePage([])
    mockUsePaginatedList.mockReturnValue({
      pages: [initialPage],
      hasNextPage: false,
      endCursor: null,
      loadMore: mockLoadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey: Symbol('source-crawls-empty'),
    })

    render(
      <SourceCrawlsPage
        data={initialPage}
        rssFeedId='feed-1'
        topic={{ id: 'topic-1', slug: 'source-slug', topic_type: 'rss_feed' }}
      />,
    )

    expect(mockTranslate).toHaveBeenCalledWith(
      'extracted.manageSource.crawlHistorySection.noCrawlsYet_12d0f59a',
    )
  })
})
