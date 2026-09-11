import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicPostsPage } from './topic-posts-page'
import { ApiError } from '@/lib/api/error'

const { mockGetPosts, mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetPosts: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getPosts: mockGetPosts,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
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

describe('TopicPostsPage', () => {
  beforeEach(() => {
    mockGetPosts.mockReset()
    mockGetCurrentUser.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
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

  it('uses URL sort and query params for topic posts without post type filtering', async () => {
    await TopicPostsPage({
      id: 'topic-1',
      searchParams: { q: 'cashback #cards', sort: 'hot', post_types: 'review' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        topics: 'topic-1',
        q: 'cashback #cards',
        sort: 'hot',
        limit: 25,
      },
    })
  })

  it('normalizes unsupported URL sorts for topic posts', async () => {
    await TopicPostsPage({
      id: 'topic-1',
      searchParams: { sort: 'unsupported' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        topics: 'topic-1',
        sort: 'new',
        limit: 25,
      },
    })
  })

  it('renders recoverable hashtag search errors inline', async () => {
    mockGetPosts.mockRejectedValue(
      new ApiError('Bad Request', 400, { error: 'Topic #missing was not found' }),
    )

    const ui = await TopicPostsPage({ id: 'topic-1', searchParams: { q: '#missing' } })
    render(ui)

    expect(screen.getByText('Topic #missing was not found')).toBeDefined()
    expect(screen.queryByText(/"topics"/)).toBeNull()
  })
})
