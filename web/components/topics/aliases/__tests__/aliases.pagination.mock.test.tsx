import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import type { Topic } from '@/types/topics'
import { AliasesClient } from '../aliases-client'

type InfiniteScrollProps = Parameters<
  typeof import('@/components/shared/infinite-scroll').InfiniteScroll
>[0]
type RecordedInfiniteScrollProps = Omit<InfiniteScrollProps, 'children'>

const { mockInfiniteScrollProps, mockLoadMore, mockUsePaginatedList } = vi.hoisted(() => ({
  mockInfiniteScrollProps: vi.fn<(props: RecordedInfiniteScrollProps) => void>(),
  mockLoadMore: vi.fn<() => Promise<void>>(),
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children, ...props }: InfiniteScrollProps) => {
    mockInfiniteScrollProps(props)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopicAliases: vi.fn<VitestLooseMock>(),
  createTopicAliases: vi.fn<VitestLooseMock>(),
  deleteTopicAlias: vi.fn<VitestLooseMock>(),
}))

const baseTopic: Topic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'Topic',
  slug: 'topic',
  markdown: '',
  aliases: [],
  topic_type: 'topic',
  noindex: false,
  allow_reviews: true,
  created_at: '2026-01-01T00:00:00.000Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'u1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'u1', display_name: null, display_name_url_id: null },
}

function makePage(
  results: string[],
  pageInfo: Partial<ListResponse<{ id: string; alias: string }>['page_info']> = {},
): ListResponse<{ id: string; alias: string }> {
  return {
    results: results.map(alias => ({ id: `id-${alias}`, alias })),
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null, ...pageInfo },
  }
}

describe('AliasesClient — pagination', () => {
  it('fetches from the topic aliases endpoint and forwards continuation state to InfiniteScroll', () => {
    const initialPage = makePage(['alias1'], { has_next_page: true, end_cursor: 'alias-cursor' })
    const resetKey = Symbol('aliases-reset')
    mockUsePaginatedList.mockReturnValue({
      pages: [initialPage],
      hasNextPage: true,
      endCursor: 'alias-cursor',
      loadMore: mockLoadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetToFirstPage: vi.fn<VitestLooseMock>(),
      resetKey,
    })

    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialPage}
      />,
    )

    expect(mockUsePaginatedList).toHaveBeenCalledWith(
      initialPage,
      '/api/v1/topics/topic-1/aliases',
      {},
      expect.objectContaining({ fetchPage: expect.any(Function) }),
    )
    expect(mockInfiniteScrollProps).toHaveBeenCalledWith(
      expect.objectContaining({
        hasNextPage: true,
        endCursor: 'alias-cursor',
        onLoadMore: mockLoadMore,
        resetKey,
      }),
    )
    expect(screen.getByText('alias1')).toBeInTheDocument()
  })

  it('dedupes aliases accumulated across multiple pages', () => {
    const page1 = makePage(['alias1', 'alias2'], { has_next_page: true, end_cursor: 'cursor-2' })
    const page2 = makePage(['alias2', 'alias3'])
    mockUsePaginatedList.mockReturnValue({
      pages: [page1, page2],
      hasNextPage: false,
      endCursor: null,
      loadMore: mockLoadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetToFirstPage: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('aliases-two-pages'),
    })

    render(
      <AliasesClient
        topic={baseTopic}
        initialData={page1}
      />,
    )

    expect(screen.getByText('alias1')).toBeInTheDocument()
    expect(screen.getByText('alias2')).toBeInTheDocument()
    expect(screen.getByText('alias3')).toBeInTheDocument()
    // alias2 appears in both pages but should only render once
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3)
  })

  it('renders the empty state when there are no aliases across any page', () => {
    const emptyPage = makePage([])
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyPage],
      hasNextPage: false,
      endCursor: null,
      loadMore: mockLoadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetToFirstPage: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('aliases-empty'),
    })

    render(
      <AliasesClient
        topic={baseTopic}
        initialData={emptyPage}
      />,
    )

    expect(screen.getByText('No aliases yet')).toBeInTheDocument()
  })
})
