/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals -- moved test support preserves existing Testing Library selectors */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import type { Post } from '@/types/posts'
import type { RssFeedItem, Story } from '@/types/rss-feed-items'

const mockAuthState = vi.hoisted(() => ({ isAuthenticated: true }))
export { mockAuthState }

const nextDynamicMock = vi.hoisted(() => {
  return {
    default: () => {
      // oxlint-disable-next-line react/only-export-components -- next/dynamic test double, never fast-refreshed
      return function MockDynamic() {
        return null
      }
    },
  }
})

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

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
        children: ReactNode
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
      useAuth: () => ({ isAuthenticated: mockAuthState.isAuthenticated }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitRssFeedItemVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: () => (
    // ast-grep-ignore: web-no-raw-form-elements -- test double replaces HideButton with a native button the cluster tests query by label
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

export const makeItem = (id: string, title: string): RssFeedItem =>
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

export const makeStory = (overrides?: Partial<Story>): Story => ({
  id: 'story-1',
  title: 'Test Story',
  cluster_reason: null,
  published_at: null,
  official_rss_feed_item_id: null,
  ...overrides,
})

export const makePost = (overrides?: Partial<Post>): Post => ({
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test Post',
  slug: 'test-post',
  markdown: '',
  root_post_id: null,
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
