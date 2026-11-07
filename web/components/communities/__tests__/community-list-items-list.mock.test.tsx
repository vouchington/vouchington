import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import type { CommunityListItem } from '@/types/api-responses'
import type { CommunityListPageData } from '@/types/api-responses/community-list-pages'
import { CommunityListItemsList } from '../community-list-items-list'

type InfiniteScrollProps = Parameters<
  typeof import('@/components/shared/infinite-scroll').InfiniteScroll
>[0]

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children, hasNextPage, onLoadMore }: InfiniteScrollProps) => (
    <div>
      {children}
      {hasNextPage ? (
        <button
          type='button'
          onClick={() => {
            void onLoadMore()
          }}
        >
          Load more
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock(import('../community-list-item-card'), () => ({
  CommunityListItemCard: ({ item }: { item: { id: string } }) => <div>{item.id}</div>,
}))

function emptyPage(hasNextPage: boolean, endCursor: string | null): CommunityListPageData {
  return {
    page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
    results: [],
    community_list_items: {},
  }
}

function itemPage(id: string): CommunityListPageData {
  const item = {
    id,
    community_id: 'community-1',
    item_type: 'topic',
    entity_id: 'topic-1',
    order_index: 0,
    added_by_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
  } as unknown as CommunityListItem
  return {
    page_info: { has_next_page: false, end_cursor: null, start_cursor: 'cursor-1' },
    results: [{ __entity_type: 'community_list_item', id }],
    community_list_items: { [id]: item },
  }
}

function renderList(initialData: CommunityListPageData) {
  return render(
    <CommunityListItemsList
      initialData={initialData}
      endpoint='/api/v1/communities/rewards/list-items/topics'
      itemType='topic'
      communitySlug='rewards'
    />,
  )
}

describe('CommunityListItemsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the empty state when the list is finished', () => {
    renderList(emptyPage(false, null))

    expect(screen.getByText('No items yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('keeps load more available when the visible page is empty and another window exists', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(itemPage('item-2'))

    renderList(emptyPage(true, 'cursor-1'))

    expect(screen.queryByText('No items yet')).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Load more' }).click()

    expect(await screen.findByText('item-2')).toBeInTheDocument()
    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/communities/rewards/list-items/topics', {
      after: 'cursor-1',
    })
  })

  it('renders visible items from the first page', () => {
    renderList(itemPage('item-1'))

    expect(screen.getByText('item-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})
