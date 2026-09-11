import { describe, expect, it, vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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
import type { RssFeedItem, RssFeedItemElection, Story } from '@/types/rss-feed-items'

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

const makeElection = (id: string): RssFeedItemElection => ({
  __entity_type: 'rss_feed_item_election',
  id,
  votes_score_net: 0,
  votes_count_up: 0,
  votes_count_down: 0,
})

const makeStory = (overrides?: Partial<Story>): Story => ({
  id: 'story-1',
  title: 'Test Story',
  cluster_reason: null,
  published_at: null,
  official_rss_feed_item_id: null,
  ...overrides,
})

const primary = makeItem('item-1', 'Primary Article')
const storyItem1 = makeItem('item-2', 'Related Article 1')
const storyItem2 = makeItem('item-3', 'Related Article 2')

describe('NewsItemCluster story expand/collapse interactions', () => {
  it('shows "N related articles" button when story items exist', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1, storyItem2]}
        story={makeStory()}
        view='summary'
      />,
    )
    expect(screen.getByText('Primary Article')).toBeDefined()
    expect(screen.getByRole('button', { name: /2 related articles/i })).toBeDefined()
  })

  it('uses singular "1 related article" for single story item', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={makeStory()}
        view='summary'
      />,
    )
    expect(screen.getByRole('button', { name: /1 related article$/i })).toBeDefined()
  })

  it('expands to show story items on click', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1, storyItem2]}
        story={makeStory()}
        view='summary'
      />,
    )
    expect(screen.getByText('Related Article 1')).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /2 related articles/i }))
    expect(screen.getByText('Related Article 1')).toBeVisible()
    expect(screen.getByText('Related Article 2')).toBeVisible()
    expect(screen.getByRole('button', { name: /hide articles/i })).toBeDefined()
  })

  it('collapses story items on second click', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1, storyItem2]}
        story={makeStory()}
        view='summary'
      />,
    )
    const button = screen.getByRole('button', { name: /2 related articles/i })

    fireEvent.click(button)
    expect(screen.getByText('Related Article 1')).toBeVisible()

    fireEvent.click(button)
    expect(screen.getByText('Related Article 1')).not.toBeVisible()
  })

  it('renders action row with voting when election exists', async () => {
    const primaryElection: RssFeedItemElection = {
      ...makeElection('election-1'),
      votes_score_net: 5,
      votes_count_up: 7,
      votes_count_down: 2,
    }
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        primaryElection={primaryElection}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    expect(container.querySelector('.scrollbar-hide')).not.toBeNull()
    await waitFor(() => {
      expect(screen.getByTestId('news-item-vote')).toBeDefined()
    })
  })

  it('renders an action row for each expanded story item', () => {
    const story = makeStory()
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={story}
        view='summary'
        relatedPosts={[]}
        storyItemActionContexts={{
          [storyItem1.id]: {
            relatedPosts: [],
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

    expect(container.querySelectorAll('[data-pw="news-item-actions-row"]')).toHaveLength(2)
  })

  it('forwards the primary election vote choice to ScoreVote', async () => {
    const primaryElection: RssFeedItemElection = {
      ...makeElection('election-1'),
      votes_score_net: 5,
      votes_count_up: 7,
      votes_count_down: 2,
    }
    render(
      <NewsItemCluster
        primary={primary}
        primaryElection={primaryElection}
        primaryElectionVote={{
          __entity_type: 'election_vote',
          entity_id: primary.id,
          user_id: 'user-1',
          choice: 'vouch',
          created_at: '2026-01-01T00:00:00Z',
        }}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('existing-vote-choice').textContent).toBe('vouch')
      expect(screen.getByTestId('entity-type').textContent).toBe('rss_feed_item')
    })
  })
})
