/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals -- moved test support preserves existing Testing Library selectors */
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { createUserPathname } from '@/lib/links/entity-href'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
// Imported after the mock helpers above so the mock factories can reference them.
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'
import { ClusterListNavIds } from '@/test-helpers/components/news/cluster-list-nav-ids'

const clusterViewer = vi.hoisted(() => ({ id: null as string | null }))
export function setClusterMockViewerId(id: string | null) {
  clusterViewer.id = id
}

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
      useAuth: () => ({
        isAuthenticated: true,
        currentUser: clusterViewer.id ? { id: clusterViewer.id } : null,
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ sharedByUser }: { sharedByUser?: { username?: string } }) =>
    sharedByUser?.username ? (
      <div>
        <span>Shared by</span>{' '}
        <a href={createUserPathname(sharedByUser.username)}>@{sharedByUser.username}</a>
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

export const makeClusterItem = (id: string, title: string) =>
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

export const makeClusterElection = (id: string) => ({
  __entity_type: 'rss_feed_item_election' as const,
  id,
  votes_score_net: 0,
  votes_count_up: 0,
  votes_count_down: 0,
})

export const makeClusterResult = (id: string, storyId: string | null = null) => ({
  __entity_type: 'rss_feed_item' as const,
  id,
  published_at: '2025-01-15T10:00:00Z',
  story_id: storyId,
})

export const makeClusterStoryPage = (itemIds: string[]) => ({
  item_ids: itemIds,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
})

export function renderClusterList(
  data: RssFeedItemsFeedResponseBody,
  options?: { modal?: ReactNode; nav?: boolean },
) {
  const modal = options?.nav ? <ClusterListNavIds /> : options?.modal
  return render(
    <FeedStyleProvider>
      <NewsItemClusterList
        data={data}
        modal={modal}
      />
    </FeedStyleProvider>,
  )
}
