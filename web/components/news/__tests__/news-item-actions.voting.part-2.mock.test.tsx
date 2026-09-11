import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, expect, it, vi } from 'vitest'

import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { ReactNode } from 'react'

import type { RssFeedItem } from '@/types/rss-feed-items'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockAuthState = vi.hoisted(() => ({ isAuthenticated: true }))
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: mockAuthState.isAuthenticated }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

const mockNav = createNavMock()

mockNav.setPathname('/news')

const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})

vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

vi.mock(
  import('@/components/votes/score-vote'),
  () =>
    ({
      ScoreVote: ({
        countUp,
        countDown,
        signedOut,
        existingVoteChoice,
        entityType,
        electionId,

        submitVote,
        'data-pw': dataPw,
      }: {
        countUp: number
        countDown: number
        signedOut?: boolean
        existingVoteChoice?: string
        entityType?: string
        electionId: string
        submitVote: (id: string, choice: string) => Promise<void>
        'data-pw'?: string
      }) => (
        <div data-testid={dataPw ?? 'score-vote'}>
          <span data-testid='count-up'>{countUp}</span>
          <span data-testid='count-down'>{countDown}</span>
          <span data-testid='signed-out'>{String(signedOut)}</span>
          <span data-testid='existing-vote-choice'>{String(existingVoteChoice)}</span>
          <span data-testid='entity-type'>{String(entityType)}</span>

          <button
            type='button'
            aria-label='Submit vote'
            data-testid={`${dataPw ?? 'score-vote'}-submit`}
            onClick={() => submitVote(electionId, 'vouch')}
          />
        </div>
      ),
    }) as unknown as typeof import('@/components/votes/score-vote'),
)

vi.mock(import('@/components/news/news-discuss-menu'), () => ({
  NewsDiscussMenu: () => <div data-testid='news-discuss-menu' />,
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: ({
    initialActive,
  }: {
    entityType: string
    entityId: string
    initialActive?: boolean
  }) => (
    <button
      data-testid='hide-button'
      data-active={initialActive}
      type='button'
    >
      {initialActive ? 'Unhide' : 'Hide'}
    </button>
  ),
  HideMenuItem: () => <div data-testid='hide-menu-item' />,
}))

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: ({
    initialActive,
  }: {
    entityType: string
    entityId: string
    initialActive?: boolean
  }) => (
    <button
      data-testid='save-button'
      data-active={initialActive}
      type='button'
    >
      {initialActive ? 'Saved' : 'Save'}
    </button>
  ),
  SaveMenuItem: () => <div data-testid='save-menu-item' />,
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitRssFeedItemVote: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    ExternalLink: () => null,
    MessageSquare: () => null,
    MoreHorizontal: () => null,
    Plus: () => null,
  }),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => null,
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

vi.mock(import('@/lib/rss-item-nav-context'), () => ({
  useRssItemNav: () => null,
}))

import { NewsItemActions } from '../news-item-actions'

import { submitRssFeedItemVote } from '@/lib/api/client/elections'

const MOCK_ITEM: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  data: { link: 'https://example.com', guid: 'g1', title: 'Article' },
  url: { id: 'url-1', url: 'https://example.com' },
  rss_feed: {
    id: 'feed-1',
    title: 'Tech Feed',
    topic: makeRssFeedItemTopic({ id: 'topic-1' }),
  },
})

const MOCK_ELECTION = {
  __entity_type: 'rss_feed_item_election' as const,
  id: 'election-1',
  votes_score_net: 3,
  votes_count_up: 5,
  votes_count_down: 2,
}

const makeVote = (choice: 'vouch' | 'disavow' | 'neutral') => ({
  __entity_type: 'election_vote' as const,
  user_id: 'user-1',
  choice,
  created_at: '2026-01-01T00:00:00Z',
})

describe('NewsItemActions voting', () => {
  it('passes signedOut=false when user is logged in', async () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        election={MOCK_ELECTION}
        relatedPosts={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('signed-out').textContent).toBe('false')
    })
  })

  it('passes signedOut=true when user is not logged in', async () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        election={MOCK_ELECTION}
        relatedPosts={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('signed-out').textContent).toBe('true')
    })
    mockAuthState.isAuthenticated = true
  })
})
