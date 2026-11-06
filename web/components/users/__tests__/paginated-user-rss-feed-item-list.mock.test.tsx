import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRssFeedItem } from '@/test-helpers/api-responses/rss-feed-items'
import type { RssFeedItemsListResponseBody } from '@/types/api-responses'
import { getPaginatedPage } from '@/lib/api/client'
import { PaginatedUserRssFeedItemList } from '../paginated-user-rss-feed-item-list'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/news-item-card'), () => ({
  NewsItemCard: ({ item }: { item: { id: string } }) => <div>{item.id}</div>,
}))

function makePage(
  ids: string[],
  {
    endCursor = null,
    hasNextPage = false,
  }: { endCursor?: string | null; hasNextPage?: boolean } = {},
): RssFeedItemsListResponseBody {
  return {
    results: ids.map(id => makeRssFeedItem({ id })),
    page_info: {
      end_cursor: endCursor,
      has_next_page: hasNextPage,
      start_cursor: null,
    },
    rss_feed_item_thumbnail_url: {},
    rss_feed_item_embeds: {},
  }
}

describe('PaginatedUserRssFeedItemList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the next page when the current page is empty but has a continuation', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['item-2']))

    render(
      <PaginatedUserRssFeedItemList
        initialData={makePage([], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/rss-feed-items/saved'
        params={{ media_type: 'audio' }}
        emptyTitle='No saved RSS items'
        emptyDescription='There are no saved RSS feed items to show.'
      />,
    )

    expect(screen.getByText('No saved RSS items')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/users/alice/rss-feed-items/saved', {
        after: 'cursor-1',
        media_type: 'audio',
      })
    })
    expect(await screen.findByText('item-2')).toBeDefined()
  })
})
