import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferralLinkFeedList } from '../referral-link-feed-list'
import type { ReferralLinkFeedResponse } from '@/types/api-responses'

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@ts-shared/utils/collections'), () => ({
  mergePageResultsById: vi.fn<VitestLooseMock>(),
  mergeRecords: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../referral-link-feed-card'), () => ({
  ReferralLinkFeedCard: ({ item }: { item: { id: string } }) => (
    <div data-testid='mock-feed-card'>{item.id}</div>
  ),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    endCursor,
    fetchError,
    hasNextPage,
  }: {
    children: React.ReactNode
    endCursor: string | null
    fetchError?: Error | null
    hasNextPage: boolean
  }) => (
    <div
      data-testid='infinite-scroll'
      data-end-cursor={endCursor ?? ''}
      data-has-next-page={hasNextPage}
    >
      {children}
      {fetchError && <button type='button'>Retry</button>}
    </div>
  ),
}))

vi.mock(import('@/components/shared/empty-state'), () => ({
  EmptyState: () => <div>default empty state</div>,
}))

const emptyData: ReferralLinkFeedResponse = {
  results: [],
  users: {},
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const feedItem = {
  id: 'item-1',
  user_id: 'user-1',
  referral_program_id: 'prog-1',
  referral_program_name: 'Chase',
  referral_program_slug: 'chase',
  url: 'https://example.com/ref',
  label: null,
}

describe('ReferralLinkFeedList', () => {
  let mockUsePaginatedList: ReturnType<typeof vi.fn>
  let mockMergePageResultsById: ReturnType<typeof vi.fn>
  let mockMergeRecords: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const paginatedListMod = await import('@/hooks/use-paginated-list')
    const collectionsMod = await import('@ts-shared/utils/collections')
    mockUsePaginatedList = vi.mocked(paginatedListMod.usePaginatedList)
    mockMergePageResultsById = vi.mocked(collectionsMod.mergePageResultsById)
    mockMergeRecords = vi.mocked(collectionsMod.mergeRecords)
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyData],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
    })
    mockMergePageResultsById.mockReturnValue([])
    mockMergeRecords.mockReturnValue({})
  })

  it('renders default empty state when no results and no emptyState prop', () => {
    render(<ReferralLinkFeedList data={emptyData} />)
    expect(screen.getByText('default empty state')).toBeDefined()
  })

  it('renders custom emptyState prop when no results', () => {
    render(
      <ReferralLinkFeedList
        data={emptyData}
        emptyState={<div>custom empty</div>}
      />,
    )
    expect(screen.getByText('custom empty')).toBeDefined()
  })

  it('keeps an empty page inside infinite scroll when its cursor has more data', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyData],
      hasNextPage: true,
      endCursor: 'last-inspected-id',
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
    })

    render(
      <ReferralLinkFeedList
        data={emptyData}
        nextPageEndpoint='/api/v1/referral-links/feed'
      />,
    )

    expect(screen.queryByText('default empty state')).toBeNull()
    expect(screen.getByTestId('infinite-scroll').getAttribute('data-end-cursor')).toBe(
      'last-inspected-id',
    )
  })

  it('renders feed cards when results are present', () => {
    mockMergePageResultsById.mockReturnValue([feedItem])
    mockMergeRecords.mockReturnValue({ 'user-1': { id: 'user-1', username: 'alice' } })

    render(<ReferralLinkFeedList data={emptyData} />)

    expect(screen.getByTestId('mock-feed-card')).toBeDefined()
    expect(screen.getByText('item-1')).toBeDefined()
  })

  it('keeps a short page inside infinite scroll when its cursor has more data', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyData],
      hasNextPage: true,
      endCursor: 'last-inspected-id',
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
    })
    mockMergePageResultsById.mockReturnValue([feedItem])
    mockMergeRecords.mockReturnValue({ 'user-1': { id: 'user-1', username: 'alice' } })

    render(
      <ReferralLinkFeedList
        data={emptyData}
        nextPageEndpoint='/api/v1/referral-links/feed'
      />,
    )

    expect(screen.getByTestId('mock-feed-card')).toBeDefined()
    expect(screen.getByTestId('infinite-scroll').getAttribute('data-end-cursor')).toBe(
      'last-inspected-id',
    )
  })

  it('keeps the retry footer for a nonempty page after continuation fails', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyData],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: new Error('page failed'),
      clearError: vi.fn<VitestLooseMock>(),
    })
    mockMergePageResultsById.mockReturnValue([feedItem])
    mockMergeRecords.mockReturnValue({ 'user-1': { id: 'user-1', username: 'alice' } })

    render(
      <ReferralLinkFeedList
        data={emptyData}
        nextPageEndpoint='/api/v1/referral-links/feed'
      />,
    )

    expect(screen.getByTestId('mock-feed-card')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()
  })
})
