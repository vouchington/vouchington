import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import {
  makeClusterItem,
  makeClusterElection,
  makeClusterResult,
  renderClusterList,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

describe('NewsItemClusterList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders shared items as standalone rows with attribution', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [
        {
          ...makeClusterResult('share-event-1'),
          id: 'share-event-1',
          entity_id: 'item-1',
          delivery_type: 'share',
          shared_by_id: 'user-1',
        },
        makeClusterResult('item-1'),
      ],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Shared Article'),
      },
      users: {
        'user-1': { account_type: null, id: 'user-1', username: 'sharer' },
      },
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderClusterList(data)

    expect(screen.getByText('Shared by')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '@sharer' })).toHaveAttribute('href', '/user/sharer')
    expect(screen.getAllByText('Shared Article')).toHaveLength(2)
  })

  it("forwards election_votes from response to each cluster's ScoreVote", () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult('item-1'), makeClusterResult('item-2')],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Article One'),
        'item-2': makeClusterItem('item-2', 'Article Two'),
      },
      rss_feed_item_elections: {
        'item-1': makeClusterElection('election-1'),
        'item-2': makeClusterElection('election-2'),
      },
      election_votes: {
        'item-1': {
          __entity_type: 'election_vote',
          entity_id: 'item-1',
          user_id: 'user-1',
          choice: 'vouch',
          created_at: '2026-01-01T00:00:00Z',
        },
        'item-2': {
          __entity_type: 'election_vote',
          entity_id: 'item-2',
          user_id: 'user-1',
          choice: 'disavow',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data)
    expect(screen.getByTestId('existing-vote-choice-election-1').textContent).toBe('vouch')
    expect(screen.getByTestId('existing-vote-choice-election-2').textContent).toBe('disavow')
    expect(screen.getByTestId('entity-type-election-1').textContent).toBe('rss_feed_item')
  })

  it('omits existingVoteChoice when election_votes is missing for an item', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult('item-1')],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Article One'),
      },
      rss_feed_item_elections: {
        'item-1': makeClusterElection('election-1'),
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderClusterList(data)
    expect(screen.getByTestId('existing-vote-choice-election-1').textContent).toBe('undefined')
  })

  it('renders distinct share events for the same article as separate rows', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [
        {
          ...makeClusterResult('share-event-1'),
          id: 'share-event-1',
          entity_id: 'item-1',
          delivery_type: 'share',
          shared_by_id: 'user-1',
        },
        {
          ...makeClusterResult('share-event-2'),
          id: 'share-event-2',
          entity_id: 'item-1',
          delivery_type: 'share',
          shared_by_id: 'user-2',
        },
      ],
      rss_feed_items: {
        'item-1': makeClusterItem('item-1', 'Shared Article'),
      },
      users: {
        'user-1': { account_type: null, id: 'user-1', username: 'sharer-one' },
        'user-2': { account_type: null, id: 'user-2', username: 'sharer-two' },
      },
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderClusterList(data)

    expect(screen.getAllByText('Shared Article')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '@sharer-one' })).toHaveAttribute(
      'href',
      '/user/sharer-one',
    )
    expect(screen.getByRole('link', { name: '@sharer-two' })).toHaveAttribute(
      'href',
      '/user/sharer-two',
    )
  })
})
