import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicReviewsPage } from './topic-reviews-page'
import { ApiError } from '@/lib/api/error'

const { mockGetPosts, mockGetCurrentUser, mockHeaders } = vi.hoisted(() => ({
  mockGetPosts: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getPosts: mockGetPosts,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

vi.mock(
  import('@/components/posts/post-list'),
  () =>
    ({
      PostList: ({ nextPageParams }: { nextPageParams: Record<string, string | number> }) => (
        <div>{JSON.stringify(nextPageParams)}</div>
      ),
    }) as unknown as typeof import('@/components/posts/post-list'),
)

vi.mock(import('@/components/posts/post-filters'), () => ({
  PostFilters: () => <div>post filters</div>,
}))

describe('TopicReviewsPage', () => {
  beforeEach(() => {
    mockGetPosts.mockReset()
    mockGetCurrentUser.mockReset()
    mockGetPosts.mockResolvedValue({
      results: [],
      page_info: {
        has_next_page: false,
        end_cursor: null,
        start_cursor: null,
      },
      posts: {},
      posts_metrics: {},
      post_elections: {},
      markdown_to_html: {},
    })
  })

  it('uses sort=new for logged-out viewers', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await TopicReviewsPage({ id: 'topic-1' })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        review_topic: 'topic-1',
        post_types: 'review',
        sort: 'new',
        limit: 25,
      },
    })
  })

  it('uses sort=following_new for logged-in viewers', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], membership_plan: null })

    await TopicReviewsPage({ id: 'topic-1' })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        review_topic: 'topic-1',
        post_types: 'review',
        sort: 'following_new',
        limit: 25,
      },
    })
  })

  it('uses URL sort and query params for topic reviews', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], membership_plan: null })

    await TopicReviewsPage({
      id: 'topic-1',
      searchParams: { q: 'cashback #cards', sort: 'hot' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        review_topic: 'topic-1',
        post_types: 'review',
        q: 'cashback #cards',
        sort: 'hot',
        limit: 25,
      },
    })
  })

  it('normalizes unsupported URL sorts for topic reviews', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], membership_plan: null })

    await TopicReviewsPage({
      id: 'topic-1',
      searchParams: { sort: 'unsupported' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        review_topic: 'topic-1',
        post_types: 'review',
        sort: 'following_new',
        limit: 25,
      },
    })
  })

  it('renders recoverable hashtag search errors inline', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetPosts.mockRejectedValue(
      new ApiError('Bad Request', 400, { error: 'Topic #missing was not found' }),
    )

    const ui = await TopicReviewsPage({ id: 'topic-1', searchParams: { q: '#missing' } })
    render(ui)

    expect(screen.getByText('Topic #missing was not found')).toBeDefined()
    expect(screen.queryByText(/"review_topic"/)).toBeNull()
  })
})
