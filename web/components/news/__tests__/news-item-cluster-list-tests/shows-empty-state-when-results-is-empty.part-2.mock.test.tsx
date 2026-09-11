import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

import { NewsItemClusterList } from '../../news-item-cluster-list'

import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'

import type { Post } from '@/types/posts'

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

vi.mock(
  import('@/components/news/news-discuss-menu'),
  () =>
    ({
      NewsDiscussMenu: ({
        relatedPosts,
      }: {
        relatedPosts: Array<{ id: string; slug: string; title: string | null; post_type: string }>
      }) => (
        <div data-testid='news-discuss-menu'>
          {relatedPosts?.map(post => (
            <a
              key={post.id}
              href={`/${post.post_type === 'discussion' ? 'discussion' : 'post'}/${post.slug}`}
            >
              {post.title ?? 'Untitled'}
            </a>
          ))}
        </div>
      ),
    }) as unknown as typeof import('@/components/news/news-discuss-menu'),
)

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

const makePost = (id: string, title: string): Post =>
  ({
    id,
    title,
    slug: id,
    post_type: 'discussion',
    markdown: '',
    ai_summary_markdown: null,
    broadcast: 'everyone',
    privacy: 'public',
    clearance_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user_id: 'user-1',
  }) as unknown as Post

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

  it('renders per-item story member actions after expanding a cluster', () => {
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeResult('item-1', 'story-1'), makeResult('item-2', 'story-1')],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Primary Article'),
        'item-2': makeItem('item-2', 'Related Article'),
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
        'item-1': makeElection('election-1'),
        'item-2': makeElection('election-2'),
      },
      election_votes: {
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
    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

    expect(screen.getByTestId('score-vote-election-2')).toBeDefined()
    expect(screen.getByTestId('existing-vote-choice-election-2').textContent).toBe('disavow')
  })

  it('uses cluster-wide related discussion links for story item actions', () => {
    const primaryPost = makePost('primary-discussion', 'Primary Discussion')
    const relatedPost = makePost('related-discussion', 'Related Discussion')
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeResult('item-1', 'story-1'), makeResult('item-2', 'story-1')],
      rss_feed_items: {
        'item-1': makeItem('item-1', 'Primary Article'),
        'item-2': makeItem('item-2', 'Related Article'),
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
      related_posts_by_url_id: {
        'url-item-1': [primaryPost.id],
        'url-item-2': [relatedPost.id],
      },
      posts: {
        [primaryPost.id]: primaryPost,
        [relatedPost.id]: relatedPost,
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }

    renderWithProvider(data)
    expect(screen.getByRole('link', { name: 'Primary Discussion' })).toHaveAttribute(
      'href',
      '/discussion/primary-discussion',
    )
    expect(screen.getByRole('link', { name: 'Related Discussion' })).toHaveAttribute(
      'href',
      '/discussion/related-discussion',
    )

    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

    expect(screen.getAllByRole('link', { name: 'Primary Discussion' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Related Discussion' })[1]).toHaveAttribute(
      'href',
      '/discussion/related-discussion',
    )
  })
})
