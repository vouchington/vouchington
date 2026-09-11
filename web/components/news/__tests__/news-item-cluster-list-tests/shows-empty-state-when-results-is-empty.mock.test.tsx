import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

import { NewsItemClusterList } from '../../news-item-cluster-list'

import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'

import { useRssItemNav } from '@/lib/rss-item-nav-context'

import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

vi.mock(
  import('next/navigation'),
  async importOriginal =>
    ({
      ...(await importOriginal()),
      useRouter: () => ({ push: vi.fn<VitestLooseMock>(), refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

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

function NavIds() {
  const nav = useRssItemNav()
  return <div data-testid='nav-ids'>{nav?.orderedItemIds.join(',') ?? ''}</div>
}

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

  it('shows empty state when results is empty', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [],
      rss_feed_items: {},
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderWithProvider(data)
    expect(screen.getByText('No news found')).toBeDefined()
  })

  it('keeps the modal mounted when results are empty', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [],
      rss_feed_items: {},
      rss_feed_item_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderWithProvider(data, <NavIds />)

    expect(screen.getByText('No news found')).toBeDefined()
    expect(screen.getByTestId('nav-ids')).toHaveTextContent('')
  })

  it('renders items without story_id as standalone', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeResult('item-1'), makeResult('item-2')],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Article One'),
        'item-2': makeItem('item-2', 'Article Two'),
      },
      rss_feed_item_elections: {
        'item-1': makeElection('item-1'),
        'item-2': makeElection('item-2'),
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderWithProvider(data)
    expect(screen.getByText('Article One')).toBeDefined()
    expect(screen.getByText('Article Two')).toBeDefined()
  })

  it('clusters items by story_id - member items hidden until expanded', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [
        makeResult('item-1', 'story-1'),
        makeResult('item-2', 'story-1'),
        makeResult('item-3'),
      ],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Primary Article'),
        'item-2': makeItem('item-2', 'Related Article'),
        'item-3': makeItem('item-3', 'Standalone Article'),
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
        'item-1': makeElection('item-1'),
        'item-2': makeElection('item-2'),
        'item-3': makeElection('item-3'),
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    renderWithProvider(data)

    // Primary and standalone are visible
    expect(screen.getByText('Primary Article')).toBeDefined()
    expect(screen.getByText('Standalone Article')).toBeDefined()

    // Related article is a story member - mounted but hidden until expanded
    expect(screen.getByText('Related Article')).not.toBeVisible()

    // Cluster shows expand button
    expect(screen.getByRole('button', { name: /1 related article$/i })).toBeDefined()
  })
})
