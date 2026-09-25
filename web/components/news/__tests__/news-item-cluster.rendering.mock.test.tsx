import { describe, expect, it, vi } from 'vitest'

import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

import { render, screen } from '@testing-library/react'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const nextDynamicMock = vi.hoisted(() => {
  return {
    default: () =>
      function MockDynamic() {
        return null
      },
  }
})

vi.mock(import('next/dynamic'), () => nextDynamicMock)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

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

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitRssFeedItemVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
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

vi.mock(
  import('@/components/votes/score-vote'),
  () =>
    ({
      ScoreVote: ({
        existingVoteChoice,
        entityType,
        'data-pw': dataPw,
      }: {
        electionId: string
        countUp: number
        countDown: number
        submitVote: () => Promise<void>
        signedOut?: boolean
        existingVoteChoice?: string
        entityType?: string
        'data-pw'?: string
      }) => (
        <div data-testid={dataPw ?? 'score-vote'}>
          <span data-testid='existing-vote-choice'>{String(existingVoteChoice)}</span>
          <span data-testid='entity-type'>{String(entityType)}</span>
        </div>
      ),
    }) as unknown as typeof import('@/components/votes/score-vote'),
)

import { NewsItemCluster } from '../news-item-cluster'

import type { RssFeedItem, Story } from '@/types/rss-feed-items'

import type { Post } from '@/types/posts'

const makeItem = (id: string, title: string): RssFeedItem =>
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

const makeStory = (overrides?: Partial<Story>): Story => ({
  id: 'story-1',
  title: 'Test Story',
  cluster_reason: null,
  published_at: null,
  official_rss_feed_item_id: null,
  ...overrides,
})

const makePost = (overrides?: Partial<Post>): Post => ({
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test Post',
  slug: 'test-post',
  markdown: '',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
  ...overrides,
})

const primary = makeItem('item-1', 'Primary Article')

describe('NewsItemCluster rendering', () => {
  it('renders standalone NewsItemCard when no story', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        view='summary'
      />,
    )
    expect(screen.getByText('Primary Article')).toBeDefined()
    expect(screen.queryByRole('button', { name: /related/i })).toBeNull()
    expect(container.querySelector('[data-pw="news-item-card"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="news-item-cluster"]')).toBeNull()
  })

  it('wraps story in a Card with data-pw="news-item-cluster" when story is present', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'My Story' })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-cluster"]')).not.toBeNull()
    expect(screen.getByText('My Story')).toBeDefined()
  })

  it('displays story title when provided', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    expect(screen.getByText('AI Breakthrough')).toBeDefined()
  })

  it('story title is a link to the story-post when storyPost is provided', () => {
    const storyPost = makePost({ id: 'sp-1', post_type: 'story', slug: 'ai-story-abc' })
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        storyPost={storyPost}
        view='summary'
      />,
    )
    const titleLink = screen.getByRole('link', { name: /AI Breakthrough/i })
    expect(titleLink).toBeDefined()
    expect((titleLink as HTMLAnchorElement).href).toContain('/story/ai-story-abc')
  })

  it('story title is plain text (not a link) when no storyPost', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    const title = screen.getByText('AI Breakthrough')
    expect(title.tagName).not.toBe('A')
  })

  it('shows official badge on the official item', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ official_rss_feed_item_id: 'item-1' })}
        view='summary'
      />,
    )
    expect(screen.getByText('Official source')).toBeDefined()
  })

  it('collapses headerless story with no members to standalone NewsItemCard and displays official badge', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({
          title: null,
          published_at: null,
          cluster_reason: null,
          official_rss_feed_item_id: 'item-1',
        })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-card"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="news-item-cluster"]')).toBeNull()
    expect(screen.getByText('Official source')).toBeDefined()
  })
})
