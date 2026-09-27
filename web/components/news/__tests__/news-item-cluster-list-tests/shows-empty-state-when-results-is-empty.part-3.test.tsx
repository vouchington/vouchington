import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import {
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

  it('excludes hidden story members from visible cards and modal traversal', async () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult('item-1', 'story-1'), makeClusterResult('item-2', 'story-1')],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Primary Article'),
        'item-2': makeClusterItem('item-2', 'Related Article'),
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
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderClusterList(data, { nav: true })
    expect(screen.getByTestId('nav-ids').textContent).toBe('item-1')

    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))
    expect(screen.getByTestId('nav-ids').textContent).toBe('item-1,item-2')

    await act(async () => {
      window.dispatchEvent(new CustomEvent('rss-item-hidden', { detail: { id: 'item-2' } }))
    })

    expect(screen.getByTestId('nav-ids').textContent).toBe('item-1')
    expect(screen.queryByRole('button', { name: /related article/i })).toBeNull()
  })

  it('adds only expanded story members to modal traversal', () => {
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
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderClusterList(data, { nav: true })
    expect(screen.getByTestId('nav-ids').textContent).toBe('item-1,item-3')

    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

    expect(screen.getByTestId('nav-ids').textContent).toBe('item-1,item-2,item-3')
  })

  it('skips results with no matching rss_feed_items entry', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult('item-1'), makeClusterResult('missing-item')],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Existing Article'),
      },
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data)
    expect(screen.getByText('Existing Article')).toBeDefined()
  })
})
