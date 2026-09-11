import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserPostRelationRoute, UserRssFeedRelationRoute } from '../user-relation-route-pages'

const {
  mockGetUserPostsCollection,
  mockGetUserRssFeedsCollection,
  mockGetOwnerRelationAction,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetUserPostsCollection: vi.fn<VitestLooseMock>(),
  mockGetUserRssFeedsCollection: vi.fn<VitestLooseMock>(),
  mockGetOwnerRelationAction: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getUserPostsCollection: mockGetUserPostsCollection,
  getUserRssFeedsCollection: mockGetUserRssFeedsCollection,
}))
vi.mock(import('../paginated-user-post-relation-list'), () => ({
  PaginatedUserPostRelationList: ({
    data,
    endpoint,
    relationAction,
  }: {
    data: { results: Array<{ id: string }>; page_info: { end_cursor: string | null } }
    endpoint: string
    relationAction?: unknown
  }) => (
    <div
      data-testid='paginated-posts'
      data-endpoint={endpoint}
      data-end-cursor={data.page_info.end_cursor ?? ''}
      data-post-ids={data.results.map(post => post.id).join(',')}
      data-has-relation-action={String(Boolean(relationAction))}
    />
  ),
}))
vi.mock(import('../user-relation-owner-action'), () => ({
  getOwnerRelationAction: mockGetOwnerRelationAction,
}))
vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)
vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { id: string } }) => (
    <div data-testid='rss-feed-list-item'>{feed.id}</div>
  ),
}))

describe('UserRssFeedRelationRoute', () => {
  it('renders empty state when feedsData has no results', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue({
      results: [],
      bookmarks: {},
      topic_elections: {},
      hostname_elections: {},
      election_votes: {},
    })
    mockGetOwnerRelationAction.mockResolvedValue(null)

    const result = await UserRssFeedRelationRoute({
      idOrUsername: 'alice',
      listType: 'subscribed',
    })

    render(result as React.ReactElement)
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.queryByTestId('rss-feed-list-item')).toBeNull()
  })

  it('renders rss feed list items when feedsData has results', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue({
      results: [
        {
          id: 'feed-1',
          topic: { id: 'topic-1' },
          hostname: { id: 'host-1' },
        },
      ],
      bookmarks: {},
      topic_elections: {},
      hostname_elections: {},
      election_votes: {},
    })
    mockGetOwnerRelationAction.mockResolvedValue(null)

    const result = await UserRssFeedRelationRoute({
      idOrUsername: 'alice',
      listType: 'subscribed',
    })

    render(result as React.ReactElement)
    expect(screen.getByTestId('rss-feed-list-item')).toHaveTextContent('feed-1')
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })
})

describe('UserPostRelationRoute', () => {
  it('hands the complete SSR first page and encoded continuation endpoint to the client list', async () => {
    mockGetUserPostsCollection.mockResolvedValue({
      results: [{ id: 'post-1' }, { id: 'post-2' }],
      page_info: {
        end_cursor: 'cursor-1',
        has_next_page: true,
        start_cursor: 'start-1',
      },
    })
    mockGetOwnerRelationAction.mockResolvedValue({ predicate: 'save' })

    render(
      await UserPostRelationRoute({
        idOrUsername: 'user/name',
        listType: 'saved',
      }),
    )

    const list = screen.getByTestId('paginated-posts')
    expect(list.getAttribute('data-endpoint')).toBe('/api/v1/users/user%2Fname/posts/saved')
    expect(list.getAttribute('data-end-cursor')).toBe('cursor-1')
    expect(list.getAttribute('data-post-ids')).toBe('post-1,post-2')
    expect(list.getAttribute('data-has-relation-action')).toBe('true')
  })
})
