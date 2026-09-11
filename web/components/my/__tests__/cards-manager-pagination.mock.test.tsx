import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CardsManager } from '../cards-manager'
import type { ListResponse } from '@/types/api-responses'
import type { IndividualCard } from '@/types/my'

type InfiniteScrollMockProps = Parameters<
  typeof import('@/components/shared/infinite-scroll').InfiniteScroll
>[0]
type RecordedInfiniteScrollProps = Omit<InfiniteScrollMockProps, 'children'>

const { mockClearError, mockInfiniteScrollProps, mockLoadMore, mockUsePaginatedList } = vi.hoisted(
  () => ({
    mockClearError: vi.fn<() => void>(),
    mockInfiniteScrollProps: vi.fn<(props: RecordedInfiniteScrollProps) => void>(),
    mockLoadMore: vi.fn<() => Promise<void>>(),
    mockUsePaginatedList: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    hasNextPage,
    loadingMore = false,
    fetchError = null,
    clearError = () => undefined,
    onLoadMore,
    ...props
  }: InfiniteScrollMockProps) => {
    mockInfiniteScrollProps({
      hasNextPage,
      loadingMore,
      fetchError,
      clearError,
      onLoadMore,
      ...props,
    })
    return (
      <div>
        {children}
        {hasNextPage ? (
          <button
            type='button'
            disabled={loadingMore}
            onClick={() => {
              if (fetchError) clearError()
              void onLoadMore()
            }}
          >
            {fetchError ? 'Retry' : loadingMore ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </div>
    )
  },
}))

vi.mock(import('../cards-manager/add-card-form'), () => ({
  AddCardForm: () => <div />,
}))

vi.mock(import('../cards-manager/card-edit-form'), () => ({
  CardEditFormView: ({
    card,
    canLoadMore,
    onLoadMore,
  }: {
    card: IndividualCard
    canLoadMore: boolean
    onLoadMore: () => void
  }) => (
    <div>
      <span>{card.card.name}</span>
      {canLoadMore ? (
        <button
          type='button'
          onClick={onLoadMore}
        >
          Load more cards
        </button>
      ) : null}
    </div>
  ),
}))

function makeCard(id: string, overrides: Partial<IndividualCard> = {}): IndividualCard {
  return {
    id,
    card_id: `topic-${id}`,
    opened_on: null,
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: null,
    is_authorized_user: false,
    authorized_user_of_id: null,
    note: null,
    card: { id: `topic-${id}`, name: `Card ${id}`, slug: `card-${id}` },
    authorized_user_of_card: null,
    ...overrides,
  }
}

function makePage(
  results: IndividualCard[],
  overrides: Partial<ListResponse<IndividualCard>['page_info']> = {},
): ListResponse<IndividualCard> {
  return {
    results,
    page_info: {
      has_next_page: false,
      start_cursor: results[0]?.id ?? null,
      end_cursor: null,
      ...overrides,
    },
  }
}

function setPaginationPages(
  pages: Array<ListResponse<IndividualCard>>,
  overrides: Record<string, unknown> = {},
) {
  const lastPage = pages.at(-1)!
  mockUsePaginatedList.mockReturnValue({
    pages,
    hasNextPage: lastPage.page_info.has_next_page,
    endCursor: lastPage.page_info.end_cursor,
    loadMore: mockLoadMore,
    loadingMore: false,
    fetchError: null,
    clearError: mockClearError,
    resetKey: Symbol('pagination-reset'),
    ...overrides,
  })
}

describe('CardsManager pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadMore.mockResolvedValue(undefined)
  })

  it('passes the SSR page to the pagination hook and renders appended cards', () => {
    const firstPage = makePage([makeCard('a')], {
      has_next_page: true,
      end_cursor: 'cursor-a',
    })
    setPaginationPages([firstPage, makePage([makeCard('b'), makeCard('a')])])

    render(<CardsManager initialData={firstPage} />)

    expect(mockUsePaginatedList).toHaveBeenCalledWith(firstPage, '/api/v1/my/cards', { limit: 25 })
    expect(screen.getAllByText('Card a')).toHaveLength(1)
    expect(screen.getByText('Card b')).toBeInTheDocument()
  })

  it('offers explicit card loading while editing an authorized-user parent', () => {
    const firstPage = makePage([makeCard('a')], {
      has_next_page: true,
      end_cursor: 'cursor-a',
    })
    setPaginationPages([firstPage])
    render(<CardsManager initialData={firstPage} />)

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Load more cards'))

    expect(mockLoadMore).toHaveBeenCalledOnce()
  })

  it('delegates one continuation control and its complete state to InfiniteScroll', () => {
    const firstPage = makePage([makeCard('a')], {
      has_next_page: true,
      end_cursor: 'cursor-a',
    })
    const resetKey = Symbol('cards-reset')
    setPaginationPages([firstPage], { resetKey })

    render(<CardsManager initialData={firstPage} />)

    expect(screen.getAllByRole('button', { name: 'Load more' })).toHaveLength(1)
    expect(mockInfiniteScrollProps).toHaveBeenCalledWith(
      expect.objectContaining({
        hasNextPage: true,
        endCursor: 'cursor-a',
        loadingMore: false,
        fetchError: null,
        clearError: mockClearError,
        onLoadMore: mockLoadMore,
        resetKey,
      }),
    )
  })

  it('preserves loaded cards and exposes retry after continuation failure', () => {
    const firstPage = makePage([makeCard('a')], {
      has_next_page: true,
      end_cursor: 'cursor-a',
    })
    setPaginationPages([firstPage], { fetchError: new Error('offline') })
    render(<CardsManager initialData={firstPage} />)

    expect(screen.getByText('Card a')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(mockClearError).toHaveBeenCalledOnce()
    expect(mockLoadMore).toHaveBeenCalledOnce()
  })

  it('renders a hydrated parent name without rendering its UUID', () => {
    const parentId = '00000000-0000-7000-8000-000000000703'
    const child = makeCard('child', {
      is_authorized_user: true,
      authorized_user_of_id: parentId,
      authorized_user_of_card: {
        id: parentId,
        opened_on: null,
        closed_on: null,
        card: { id: 'topic-parent', name: 'Named parent', slug: 'named-parent' },
      },
    })
    const firstPage = makePage([child])
    setPaginationPages([firstPage])
    const { container } = render(<CardsManager initialData={firstPage} />)

    expect(screen.getByText('Auth user of: Named parent')).toBeInTheDocument()
    expect(container.textContent).not.toContain(parentId)
  })
})
