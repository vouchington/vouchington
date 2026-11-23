import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  makeClusterElection,
  makeClusterItem,
  makeClusterResult,
  renderClusterList,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import { getPaginatedPage } from '@/lib/api/client'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

const endpoint = '/api/v1/feeds/rss_feed_items/any'
const lastPageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const emptyPageWithMore: RssFeedItemsFeedResponseBody = {
  results: [],
  rss_feed_items: {},
  rss_feed_item_elections: {},
  page_info: { has_next_page: true, end_cursor: 'cursor-1', start_cursor: null },
}

describe('NewsItemClusterList empty page with a next page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('hides the empty state and requests the next page', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce({
      results: [makeClusterResult('item-1')],
      rss_feed_items: { 'item-1': makeClusterItem('item-1', 'Older Article') },
      rss_feed_item_elections: { 'item-1': makeClusterElection('item-1') },
      page_info: lastPageInfo,
    })
    renderClusterList(emptyPageWithMore, { nextPageEndpoint: endpoint })

    expect(screen.queryByText('No news found')).toBeNull()
    fireEvent.click(screen.getByTestId('mock-load-more'))

    expect(await screen.findByText('Older Article')).toBeDefined()
    expect(getPaginatedPage).toHaveBeenCalledWith(endpoint, { after: 'cursor-1' })
  })

  it('shows the empty state once the last page is empty', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce({
      ...emptyPageWithMore,
      page_info: lastPageInfo,
    })
    renderClusterList(emptyPageWithMore, { nextPageEndpoint: endpoint })

    fireEvent.click(screen.getByTestId('mock-load-more'))

    await waitFor(() => expect(screen.getByText('No news found')).toBeDefined())
  })
})
