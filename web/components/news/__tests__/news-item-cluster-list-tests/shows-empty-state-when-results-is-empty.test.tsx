import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import {
  makeClusterElection,
  makeClusterItem,
  makeClusterResult,
  renderClusterList,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

describe('NewsItemClusterList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows empty state when results is empty', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [],
      rss_feed_items: {},
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data)
    expect(screen.getByText('No news found')).toBeDefined()
  })

  it('keeps the modal mounted when results are empty', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [],
      rss_feed_items: {},
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data, { nav: true })

    expect(screen.getByText('No news found')).toBeDefined()
    expect(screen.getByTestId('nav-ids')).toHaveTextContent('')
  })

  it('renders items without story_id as standalone', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult('item-1'), makeClusterResult('item-2')],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Article One'),
        'item-2': makeClusterItem('item-2', 'Article Two'),
      },
      rss_feed_item_elections: {
        'item-1': makeClusterElection('item-1'),
        'item-2': makeClusterElection('item-2'),
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data)
    expect(screen.getByText('Article One')).toBeDefined()
    expect(screen.getByText('Article Two')).toBeDefined()
  })

  it('clusters items by story_id - member items hidden until expanded', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [
        makeClusterResult('item-1', 'story-1'),
        makeClusterResult('item-2', 'story-1'),
        makeClusterResult('item-3'),
      ],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Primary Article'),
        'item-2': makeClusterItem('item-2', 'Related Article'),
        'item-3': makeClusterItem('item-3', 'Standalone Article'),
      },
      stories: {
        'story-1': {
          id: 'story-1',
          title: null,
          cluster_reason: null,
          published_at: null,
          official_rss_feed_item_id: null,
        },
      },
      story_member_ids: { 'story-1': ['item-1', 'item-2'] },
      rss_feed_item_elections: {
        'item-1': makeClusterElection('item-1'),
        'item-2': makeClusterElection('item-2'),
        'item-3': makeClusterElection('item-3'),
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data)

    expect(screen.getByText('Primary Article')).toBeDefined()
    expect(screen.getByText('Standalone Article')).toBeDefined()
    expect(screen.getByText('Related Article')).not.toBeVisible()
    expect(screen.getByRole('button', { name: /1 related article$/i })).toBeDefined()
  })
})
