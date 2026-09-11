import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTopic } from '@/test-helpers/api-responses/topics'
import type { TopicsListResponseBody } from '@/types/api-responses'
import { getPaginatedPage } from '@/lib/api/client'
import { PaginatedUserTopicList } from '../paginated-user-topic-list'

const { receiveLoadMore } = vi.hoisted(() => ({
  receiveLoadMore: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    clearError,
    fetchError,
    onLoadMore,
  }: React.PropsWithChildren<{
    clearError?: () => void
    fetchError?: Error | null
    onLoadMore: () => void
  }>) => {
    receiveLoadMore(onLoadMore)
    return (
      <div>
        {children}
        {fetchError ? (
          <button
            type='button'
            onClick={() => {
              clearError?.()
              onLoadMore()
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  },
}))

vi.mock(import('../user-topic-list'), () => ({
  UserTopicList: ({ topics }: { topics: Array<{ id: string }> }) => (
    <div>
      {topics.map(topic => (
        <span key={topic.id}>{topic.id}</span>
      ))}
    </div>
  ),
}))

function makePage(
  ids: string[],
  {
    endCursor = null,
    hasNextPage = false,
  }: { endCursor?: string | null; hasNextPage?: boolean } = {},
): TopicsListResponseBody {
  return {
    results: ids.map(id => makeTopic({ id })),
    page_info: {
      end_cursor: endCursor,
      has_next_page: hasNextPage,
      start_cursor: null,
    },
  }
}

describe('PaginatedUserTopicList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards the cursor and appends unique topics by stable ID', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['topic-1', 'topic-2']))

    render(
      <PaginatedUserTopicList
        initialData={makePage(['topic-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/topics/following'
        emptyTitle='No followed topics'
        emptyDescription='This user is not following any topics.'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/users/alice/topics/following', {
      after: 'cursor-1',
    })
    expect(screen.getAllByText('topic-1')).toHaveLength(1)
    expect(screen.getByText('topic-2')).toBeDefined()
  })

  it('preserves the first page after failure and retries the continuation', async () => {
    vi.mocked(getPaginatedPage)
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(makePage(['topic-2']))

    render(
      <PaginatedUserTopicList
        initialData={makePage(['topic-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/topics/following'
        emptyTitle='No followed topics'
        emptyDescription='This user is not following any topics.'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(screen.getByText('topic-1')).toBeDefined()
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })

    expect(await screen.findByText('topic-2')).toBeDefined()
    expect(getPaginatedPage).toHaveBeenCalledTimes(2)
  })

  it('loads the next page when the current page is empty but has a continuation', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['topic-2']))

    render(
      <PaginatedUserTopicList
        initialData={makePage([], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/topics/following'
        emptyTitle='No followed topics'
        emptyDescription='This user is not following any topics.'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/users/alice/topics/following', {
      after: 'cursor-1',
    })
    expect(await screen.findByText('topic-2')).toBeDefined()
  })
})
