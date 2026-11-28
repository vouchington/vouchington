import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  makeClusterElection,
  makeClusterItem,
  makeClusterResult,
  renderClusterList,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import { getPaginatedPage } from '@/lib/api/client'
import { setupInfiniteScrollObserverHarness } from '@/test-helpers/infinite-scroll-observer-harness'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

const endpoint = '/api/v1/feeds/rss_feed_items/any'
const lastPageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const emptyPageWithMore: RssFeedItemsFeedResponseBody = {
  results: [],
  rss_feed_items: {},
  rss_feed_item_elections: {},
  page_info: { has_next_page: true, end_cursor: 'cursor-1', start_cursor: null },
}

function storyPage(page: number): RssFeedItemsFeedResponseBody {
  const id = `story-item-${page}`
  return {
    results: [makeClusterResult(id, 'one-story')],
    rss_feed_items: { [id]: makeClusterItem(id, `Story article ${page}`) },
    rss_feed_item_elections: { [id]: makeClusterElection(id) },
    page_info: { has_next_page: true, end_cursor: `cursor-${page}`, start_cursor: null },
  }
}

describe('NewsItemClusterList empty page with a next page', () => {
  const { flushRaf, triggerIntersection, triggerScroll } = setupInfiniteScrollObserverHarness()

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
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Older Article')).toBeInTheDocument()
    expect(getPaginatedPage).toHaveBeenCalledWith(endpoint, { after: 'cursor-1' })
  })

  it('shows the empty state when a next page has no cursor to continue with', () => {
    renderClusterList(
      {
        ...emptyPageWithMore,
        page_info: { has_next_page: true, end_cursor: null, start_cursor: null },
      },
      { nextPageEndpoint: endpoint },
    )

    expect(screen.getByText('No news found')).toBeInTheDocument()
  })

  it('shows the empty state once the last page is empty', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce({
      ...emptyPageWithMore,
      page_info: lastPageInfo,
    })
    renderClusterList(emptyPageWithMore, { nextPageEndpoint: endpoint })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getByText('No news found')).toBeInTheDocument())
  })

  it('pauses automatic loading after five more pages add articles to the same story', async () => {
    const fetchPage = vi.mocked(getPaginatedPage)
    for (let page = 2; page <= 7; page += 1) fetchPage.mockResolvedValueOnce(storyPage(page))
    renderClusterList(storyPage(1), { nextPageEndpoint: endpoint })

    triggerScroll()
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      flushRaf()
      await act(async () => triggerIntersection(true))
    }

    expect(fetchPage).toHaveBeenCalledTimes(5)
    expect(screen.getByText('Story article 1')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(endpoint, { after: 'cursor-6' }))
  })
})
