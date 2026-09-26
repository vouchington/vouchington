import type { ReactNode } from 'react'
import { configure, render } from '@testing-library/react'
import { vi } from 'vitest'

configure({ testIdAttribute: 'data-pw' })

import { Button } from '@/components/ui/button'
import { ListStyleProvider } from '@/lib/preferences/list-style-context'
import type { ListStyle } from '@/lib/preferences/shared'
import type { PostsResponseBody } from '@/types/api-responses'

// Stub dynamic() to render nothing — these tests exercise list pagination, not lazy children.
vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-pw='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <Button type='button'>Save</Button>,
}))

vi.mock(import('@/components/posts/post-card'), () => ({
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
      data-pw='post-card'
      data-priority={String(priority ?? false)}
    >
      {post.title}
      <Button
        type='button'
        onClick={() => onHide?.(post.id)}
      >
        Hide {post.title}
      </Button>
    </div>
  ),
}))

// Records every onLoadMore callback passed to InfiniteScroll.
// Use mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void> after rendering.
export const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: ReactNode
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
  FollowerShareActions: () => <div data-pw='follower-share-actions' />,
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

export function renderWithListStyle(ui: ReactNode, listStyle: ListStyle = 'card') {
  if (listStyle !== 'card') {
    localStorage.setItem('list-style', listStyle)
  }
  return render(<ListStyleProvider>{ui}</ListStyleProvider>)
}

export function makePage(
  postId: string,
  title: string,
  hasNextPage: boolean,
  endCursor: string | null,
): PostsResponseBody {
  return {
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
  }
}

export const postListMockData: PostsResponseBody = {
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
