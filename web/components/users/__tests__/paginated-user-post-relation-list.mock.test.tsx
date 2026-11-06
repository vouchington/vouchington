import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import type { PostsListResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'
import { HackerNewsReferenceLabel } from '@/components/hacker-news/hacker-news-reference-label'
import { PaginatedUserPostRelationList } from '../paginated-user-post-relation-list'
import type { RelationManagementActionConfig } from '../relation-management-action'

type InfiniteScrollProps = Parameters<
  typeof import('@/components/shared/infinite-scroll').InfiniteScroll
>[0]

const { receiveInfiniteScrollProps } = vi.hoisted(() => ({
  receiveInfiniteScrollProps: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    hasNextPage,
    loadingMore = false,
    fetchError = null,
    clearError = () => undefined,
    onLoadMore,
    ...props
  }: InfiniteScrollProps) => {
    receiveInfiniteScrollProps({
      hasNextPage,
      loadingMore,
      fetchError,
      clearError,
      onLoadMore,
      ...props,
    })
    return (
      <div>
        {children}
        {hasNextPage ? (
          <button
            type='button'
            disabled={loadingMore}
            onClick={() => {
              if (fetchError) clearError()
              void onLoadMore()
            }}
          >
            {fetchError ? 'Retry' : loadingMore ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </div>
    )
  },
}))

vi.mock(import('../user-post-relation-list'), () => ({
  UserPostRelationList: ({
    posts,
    relationAction,
    onRemoved,
  }: {
    posts: Array<{ id: string }>
    relationAction?: RelationManagementActionConfig
    onRemoved?: (entityId: string) => void
  }) => (
    <div>
      {posts.map(post => (
        <div key={post.id}>
          <span>{post.id}</span>
          <HackerNewsReferenceLabel entityId={post.id} />
          {relationAction ? (
            <button
              type='button'
              onClick={() => onRemoved?.(post.id)}
            >
              Remove {post.id}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  ),
}))

const relationAction: RelationManagementActionConfig = {
  entityType: 'post',
  predicate: 'save',
  activeLabel: 'extracted.userProfileCollections.postsTopics.saved_b5c120b3',
  inactiveLabel: 'extracted.userProfileCollections.postsTopics.save_1509f561',
  errorLabel: 'extracted.userProfileCollections.postsTopics.savedPost_f7486726',
}

function relationList(data: PostsListResponseBody, endpoint: string) {
  return (
    <PaginatedUserPostRelationList
      data={data}
      endpoint={endpoint}
      emptyTitle='No posts'
      emptyDescription='There are no posts.'
      relationAction={relationAction}
    />
  )
}

function makePage(
  ids: string[],
  {
    endCursor = null,
    hasNextPage = false,
  }: { endCursor?: string | null; hasNextPage?: boolean } = {},
): PostsListResponseBody {
  return {
    results: ids.map(id => ({ id }) as Post),
    page_info: {
      end_cursor: endCursor,
      has_next_page: hasNextPage,
      start_cursor: null,
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('PaginatedUserPostRelationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['saved', 'hidden', 'following', 'subscribed'])(
    'appends unique %s posts with first-page and continuation reference counts',
    async listType => {
      const first = makePage(['post-1'], { endCursor: 'cursor-1', hasNextPage: true })
      first.post_hacker_news_references = { 'post-1': { story_count: 1, comment_count: 0 } }
      const next = makePage(['post-1', 'post-2'])
      next.post_hacker_news_references = { 'post-2': { story_count: 0, comment_count: 2 } }
      vi.mocked(getPaginatedPage).mockResolvedValueOnce(next)
      const endpoint = `/api/v1/users/alice/posts/${listType}`
      render(relationList(first, endpoint))
      expect(screen.getByText('Seen on Hacker News · 1')).toBeInTheDocument()
      await act(async () => {
        await receiveInfiniteScrollProps.mock.calls.at(-1)![0].onLoadMore()
      })
      expect(getPaginatedPage).toHaveBeenCalledWith(endpoint, { after: 'cursor-1' })
      expect(screen.getAllByText('post-1')).toHaveLength(1)
      expect(screen.getByText('Seen on Hacker News · 1')).toBeInTheDocument()
      expect(screen.getByText('Mentioned on Hacker News · 2')).toBeInTheDocument()
    },
  )

  it('preserves the first page after failure and retries the same continuation', async () => {
    vi.mocked(getPaginatedPage)
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(makePage(['post-2']))

    render(
      <PaginatedUserPostRelationList
        data={makePage(['post-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/posts/saved'
        emptyTitle='No saved posts'
        emptyDescription='There are no saved posts.'
      />,
    )

    await act(async () => {
      await receiveInfiniteScrollProps.mock.calls.at(-1)![0].onLoadMore()
    })

    expect(screen.getByText('post-1')).toBeDefined()
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })

    expect(await screen.findByText('post-2')).toBeDefined()
    expect(getPaginatedPage).toHaveBeenNthCalledWith(1, '/api/v1/users/alice/posts/saved', {
      after: 'cursor-1',
    })
    expect(getPaginatedPage).toHaveBeenNthCalledWith(2, '/api/v1/users/alice/posts/saved', {
      after: 'cursor-1',
    })
  })

  it('suppresses overlapping continuation requests', async () => {
    const nextPage = createDeferred<PostsListResponseBody>()
    vi.mocked(getPaginatedPage).mockReturnValueOnce(nextPage.promise)

    render(
      <PaginatedUserPostRelationList
        data={makePage(['post-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/posts/saved'
        emptyTitle='No saved posts'
        emptyDescription='There are no saved posts.'
      />,
    )

    const loadMore = receiveInfiniteScrollProps.mock.calls.at(-1)![0].onLoadMore
    let firstRequest!: Promise<void>
    await act(async () => {
      firstRequest = loadMore()
      await loadMore()
    })

    expect(getPaginatedPage).toHaveBeenCalledTimes(1)

    nextPage.resolve(makePage(['post-2']))
    await act(async () => {
      await firstRequest
    })
    expect(await screen.findByText('post-2')).toBeDefined()
  })

  it('delegates one continuation control and its pending state to InfiniteScroll', async () => {
    const nextPage = createDeferred<PostsListResponseBody>()
    vi.mocked(getPaginatedPage).mockReturnValueOnce(nextPage.promise)
    const firstPage = makePage(['post-1'], { endCursor: 'cursor-1', hasNextPage: true })

    render(
      <PaginatedUserPostRelationList
        data={firstPage}
        endpoint='/api/v1/users/alice/posts/saved'
        emptyTitle='No saved posts'
        emptyDescription='There are no saved posts.'
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Load more' })).toHaveLength(1)
    expect(receiveInfiniteScrollProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasNextPage: true,
        endCursor: 'cursor-1',
        loadingMore: false,
        fetchError: null,
        resetKey: expect.any(Symbol),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('button', { name: 'Loading' })).toBeDisabled()
    expect(screen.getAllByRole('button')).toHaveLength(1)

    nextPage.resolve(makePage(['post-2']))
    expect(await screen.findByText('post-2')).toBeDefined()
  })

  it.each(['saved', 'hidden', 'following', 'subscribed'])(
    'removes a later-page post from the %s query without discarding its siblings',
    async listType => {
      vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['post-target', 'post-sibling']))
      const endpoint = `/api/v1/users/alice/posts/${listType}`
      const firstPage = makePage(['post-1'], { endCursor: 'cursor-1', hasNextPage: true })
      render(relationList(firstPage, endpoint))
      await act(async () => {
        await receiveInfiniteScrollProps.mock.calls.at(-1)![0].onLoadMore()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Remove post-target' }))

      expect(screen.queryByText('post-target')).toBeNull()
      expect(screen.getByText('post-sibling')).toBeDefined()
    },
  )

  it('keeps a removed first-page post hidden from an in-flight response and scopes removal by endpoint', async () => {
    const nextPage = createDeferred<PostsListResponseBody>()
    vi.mocked(getPaginatedPage).mockReturnValueOnce(nextPage.promise)
    const savedEndpoint = '/api/v1/users/alice/posts/saved'
    const firstPage = makePage(['post-target', 'post-1'], {
      endCursor: 'cursor-1',
      hasNextPage: true,
    })
    const { rerender } = render(relationList(firstPage, savedEndpoint))
    const inFlight = receiveInfiniteScrollProps.mock.calls.at(-1)![0].onLoadMore()

    fireEvent.click(screen.getByRole('button', { name: 'Remove post-target' }))
    expect(screen.queryByText('post-target')).toBeNull()

    nextPage.resolve(makePage(['post-target', 'post-sibling']))
    await act(async () => {
      await inFlight
    })
    expect(screen.queryByText('post-target')).toBeNull()
    expect(screen.getByText('post-sibling')).toBeDefined()

    rerender(relationList(firstPage, savedEndpoint))
    expect(screen.queryByText('post-target')).toBeNull()

    rerender(relationList(makePage(['post-target']), '/api/v1/users/alice/posts/hidden'))
    expect(screen.getByText('post-target')).toBeDefined()
  })
})
