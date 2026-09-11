import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { NewsItemClusterList } from '../../news-item-cluster-list'
import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
  }: {
    children: React.ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => <div>{children}</div>,
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: () => (
    <button
      data-testid='hide-button'
      type='button'
      aria-label='Hide news item'
    />
  ),
}))

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div data-testid='follower-share-actions' />,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ sharedByUser }: { sharedByUser?: { username?: string } }) =>
    sharedByUser?.username ? (
      <div>
        <span>Shared by</span>{' '}
        <a href={`/user/${sharedByUser.username}`}>@{sharedByUser.username}</a>
      </div>
    ) : null,
}))

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: ({
    electionId,
    existingVoteChoice,
    entityType,
  }: {
    electionId: string
    existingVoteChoice?: string
    entityType?: string
  }) => (
    <div data-testid={`score-vote-${electionId}`}>
      <span data-testid={`existing-vote-choice-${electionId}`}>{String(existingVoteChoice)}</span>
      <span data-testid={`entity-type-${electionId}`}>{String(entityType)}</span>
    </div>
  ),
}))

vi.mock(import('@/components/news/news-discuss-menu'), () => ({
  NewsDiscussMenu: () => <div data-testid='news-discuss-menu' />,
}))

const makeItem = (id: string, title: string) =>
  makeRssFeedItem({
    id,
    published_at: '2025-01-15T10:00:00Z',
    data: {
      link: `https://example.com/${id}`,
      guid: `guid-${id}`,
      title,
      contentSnippet: `Excerpt for ${title}.`,
    },
    url: { id: `url-${id}`, url: `https://example.com/${id}` },
    rss_feed: {
      id: 'rss-feed-1',
      title: 'Tech Weekly',
      topic: makeRssFeedItemTopic({
        id: 'topic-1',
        name: 'Technology',
        slug: 'technology',
        topic_type: 'card',
      }),
    },
  })

const makeElection = (id: string) => ({
  __entity_type: 'rss_feed_item_election' as const,
  id,
  votes_score_net: 0,
  votes_count_up: 0,
  votes_count_down: 0,
})

const makeResult = (id: string, storyId: string | null = null) => ({
  __entity_type: 'rss_feed_item' as const,
  id,
  published_at: '2025-01-15T10:00:00Z',
  story_id: storyId,
})

function renderWithProvider(data: RssFeedItemsFeedResponseBody, modal?: React.ReactNode) {
  return render(
    <FeedStyleProvider>
      <NewsItemClusterList
        data={data}
        modal={modal}
      />
    </FeedStyleProvider>,
  )
}

describe('NewsItemClusterList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders shared items as standalone rows with attribution', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [
        {
          ...makeResult('share-event-1'),
          id: 'share-event-1',
          entity_id: 'item-1',
          delivery_type: 'share',
          shared_by_user_id: 'user-1',
        },
        makeResult('item-1'),
      ],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Shared Article'),
      },
      users: {
        'user-1': { id: 'user-1', username: 'sharer' },
      },
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderWithProvider(data)

    expect(screen.getByText('Shared by')).toBeDefined()
    expect(screen.getByRole('link', { name: '@sharer' })).toHaveAttribute('href', '/user/sharer')
    expect(screen.getAllByText('Shared Article')).toHaveLength(2)
  })

  it("forwards election_votes from response to each cluster's ScoreVote", () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeResult('item-1'), makeResult('item-2')],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Article One'),
        'item-2': makeItem('item-2', 'Article Two'),
      },
      rss_feed_item_elections: {
        'item-1': makeElection('election-1'),
        'item-2': makeElection('election-2'),
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
    renderWithProvider(data)
    expect(screen.getByTestId('existing-vote-choice-election-1').textContent).toBe('vouch')
    expect(screen.getByTestId('existing-vote-choice-election-2').textContent).toBe('disavow')
    expect(screen.getByTestId('entity-type-election-1').textContent).toBe('rss_feed_item')
  })

  it('omits existingVoteChoice when election_votes is missing for an item', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeResult('item-1')],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Article One'),
      },
      rss_feed_item_elections: {
        'item-1': makeElection('election-1'),
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderWithProvider(data)
    expect(screen.getByTestId('existing-vote-choice-election-1').textContent).toBe('undefined')
  })

  it('renders distinct share events for the same article as separate rows', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [
        {
          ...makeResult('share-event-1'),
          id: 'share-event-1',
          entity_id: 'item-1',
          delivery_type: 'share',
          shared_by_user_id: 'user-1',
        },
        {
          ...makeResult('share-event-2'),
          id: 'share-event-2',
          entity_id: 'item-1',
          delivery_type: 'share',
          shared_by_user_id: 'user-2',
        },
      ],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Shared Article'),
      },
      users: {
        'user-1': { id: 'user-1', username: 'sharer-one' },
        'user-2': { id: 'user-2', username: 'sharer-two' },
      },
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderWithProvider(data)

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
}, 10_000)
