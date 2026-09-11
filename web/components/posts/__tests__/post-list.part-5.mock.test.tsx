import { describe, it, expect, vi, beforeEach } from 'vitest'

import { act, render, screen } from '@testing-library/react'

import { PostList } from '../post-list'

import { ListStyleProvider } from '@/lib/preferences/list-style-context'

import type { PostsResponseBody } from '@/types/api-responses'

import type { ListStyle } from '@/lib/preferences/shared'

import { getPaginatedPage } from '@/lib/api/client'

// Stub dynamic() to render nothing — this test exercises list pagination, not lazy children
vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <button type='button'>Save</button>,
}))

vi.mock(import('../post-card'), () => ({
  PostCard: ({
    post,
    priority,
    onHide,
  }: {
    post: { id: string; title?: string }
    priority?: boolean
    onHide?: (postId: string) => void
  }) => (
    <div
      data-testid='post-card'
      data-priority={String(priority ?? false)}
    >
      {post.title}
      <button
        type='button'
        onClick={() => onHide?.(post.id)}
      >
        Hide {post.title}
      </button>
    </div>
  ),
}))

// Records every onLoadMore callback passed to InfiniteScroll.
// Use mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void> after rendering to get the current callback.
const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: React.ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => {
    mockReceiveLoadMore(onLoadMore)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div data-testid='follower-share-actions' />,
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

function renderWithListStyle(ui: React.ReactNode, listStyle: ListStyle = 'card') {
  if (listStyle !== 'card') {
    localStorage.setItem('list-style', listStyle)
  }
  return render(<ListStyleProvider>{ui}</ListStyleProvider>)
}

const makePage = (
  postId: string,
  title: string,
  hasNextPage: boolean,
  endCursor: string | null,
): PostsResponseBody => ({
  results: [{ __entity_type: 'post', id: postId, ranking: 1, search_vector_ts: null }],
  posts: {
    [postId]: {
      id: postId,
      post_type: 'review',
      title,
      markdown: `${title} content`,
      root_id: null,
      created_by_id: 'user-1',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      deleted_at: null,
      deleted_by_id: null,
      archived_at: null,
      archived_by_id: null,
      broadcast: 'everyone',
      privacy: 'public',
      is_anonymous: false,

      community_id: null,

      clearance_status: 'approved',
    },
  },
  posts_metrics: {},
  post_elections: {},
  page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
})

describe('PostList', () => {
  const mockData: PostsResponseBody = {
    results: [
      { __entity_type: 'post', id: 'post-1', ranking: 1, search_vector_ts: null },
      { __entity_type: 'post', id: 'post-2', ranking: 2, search_vector_ts: null },
    ],
    posts: {
      'post-1': {
        id: 'post-1',
        post_type: 'discussion',
        title: 'First Post',
        markdown: 'First post content',
        root_id: null,
        created_by_id: 'user-1',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        deleted_at: null,
        deleted_by_id: null,
        archived_at: null,
        archived_by_id: null,
        broadcast: 'everyone',
        privacy: 'public',
        is_anonymous: false,

        community_id: null,

        clearance_status: 'approved',
      },
      'post-2': {
        id: 'post-2',
        post_type: 'review',
        title: 'Second Post',
        markdown: 'Second post content',
        root_id: null,
        created_by_id: 'user-1',
        created_at: '2024-01-15T11:00:00Z',
        updated_at: '2024-01-15T11:00:00Z',
        deleted_at: null,
        deleted_by_id: null,
        archived_at: null,
        archived_by_id: null,
        broadcast: 'everyone',
        privacy: 'public',
        is_anonymous: false,

        community_id: null,

        clearance_status: 'approved',
      },
    },
    posts_metrics: {},
    post_elections: {},
    page_info: {
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('accumulates posts across three pages', async () => {
    const page1 = makePage('post-1', 'First Post', true, 'cursor1')
    const page2 = makePage('post-2', 'Second Post', true, 'cursor2')
    const page3 = makePage('post-3', 'Third Post', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2).mockResolvedValueOnce(page3)

    renderWithListStyle(
      <PostList
        data={page1}
        nextPageEndpoint='/api/v1/posts'
        nextPageParams={{ limit: 25 }}
      />,
    )

    // Load page 2; component re-renders with new cursor, exposing a new loadMore
    let loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    // Load page 3 using the updated loadMore from the re-render
    loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('First Post')).toBeDefined()
    expect(screen.getByText('Second Post')).toBeDefined()
    expect(screen.getByText('Third Post')).toBeDefined()
  })
})
