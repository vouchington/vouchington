import type { PostsResponseBody } from '@/types/api-responses'
import { beforeEach, vi } from 'vitest'

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

function emptyTopicPostListResponse(): PostsResponseBody {
  return {
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
  }
}

function resetTopicPostListPageDoubles() {
  mockGetPosts.mockReset()
  mockGetCurrentUser.mockReset()
  mockGetCurrentUser.mockResolvedValue(null)
  mockGetPosts.mockResolvedValue(emptyTopicPostListResponse())
}

export function installTopicPostListPageDoubles() {
  beforeEach(() => {
    resetTopicPostListPageDoubles()
  })
}

export { mockGetPosts }
