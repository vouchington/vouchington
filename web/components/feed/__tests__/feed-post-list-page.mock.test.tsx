import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedPostListPage } from '../feed-post-list-page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'
import type { PostsResponseBody } from '@/types/api-responses'

const { mockGetCurrentUser, mockGetPostFeed } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetPostFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getPostFeed: mockGetPostFeed,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: () => false,
}))

vi.mock(import('../feed-top-section'), () => ({
  FeedTopSection: ({ filters, viewToggle }: { filters: ReactNode; viewToggle: ReactNode }) => (
    <div>
      feed top section
      {filters}
      {viewToggle}
    </div>
  ),
}))

vi.mock(import('@/components/posts/post-filters'), () => ({
  PostFilters: () => <div>post filters</div>,
}))

vi.mock(import('@/components/posts/post-view-toggle'), () => ({
  PostViewToggle: () => <div>post view toggle</div>,
}))

vi.mock(
  import('@/components/posts/post-list'),
  () =>
    ({
      PostList: ({
        nextPageParams,
      }: {
        data: PostsResponseBody
        nextPageParams: Record<string, string | number>
      }) => <div>{JSON.stringify(nextPageParams)}</div>,
    }) as unknown as typeof import('@/components/posts/post-list'),
)

const postsResponse: PostsResponseBody = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  posts: {},
  posts_metrics: {},
}

describe('FeedPostListPage', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset()
    mockGetPostFeed.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetPostFeed.mockResolvedValue(postsResponse)
  })

  it('does not pass community scope to friends-only posts', async () => {
    const ui = await FeedPostListPage({
      config: feedRouteConfigs['posts/friends'],
      searchParams: Promise.resolve({ community: 'topic-list' }),
    })

    render(ui)

    expect(mockGetPostFeed).toHaveBeenCalledWith('follow_users', {
      searchParams: {
        limit: 25,
        sort: 'new',
      },
    })
    expect(screen.queryByText('feed top section')).toBeDefined()
  })

  it('does not pass community scope to topic posts', async () => {
    const ui = await FeedPostListPage({
      config: feedRouteConfigs['posts/topics'],
      searchParams: Promise.resolve({ community: 'topic-list' }),
    })

    render(ui)

    expect(mockGetPostFeed).toHaveBeenCalledWith('follow_topics', {
      searchParams: {
        limit: 25,
        sort: 'new',
      },
    })
  })

  it('passes search query to topic posts', async () => {
    await FeedPostListPage({
      config: feedRouteConfigs['posts/topics'],
      searchParams: Promise.resolve({ q: 'cash #cards' }),
    })

    expect(mockGetPostFeed).toHaveBeenCalledWith('follow_topics', {
      searchParams: {
        limit: 25,
        sort: 'new',
        q: 'cash #cards',
      },
    })
  })
})
