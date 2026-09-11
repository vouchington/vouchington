import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsersSearchResponseBody } from '@/types/api-responses'
import { getPaginatedPage } from '@/lib/api/client'
import { PaginatedUserSearchResults } from '../paginated-user-search-results'

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

vi.mock(
  import('@/components/users/user-list'),
  () =>
    ({
      UserList: ({
        users,
        muted,
      }: {
        users: { id: string }[]
        muted?: Record<string, boolean>
      }) => (
        <div>
          {users.map(user => (
            <div key={user.id}>
              <span data-testid={`user-${user.id}`}>{user.id}</span>
              <span data-testid={`muted-${user.id}`}>{String(muted?.[user.id] ?? false)}</span>
            </div>
          ))}
        </div>
      ),
    }) as unknown as typeof import('@/components/users/user-list'),
)

function makeUser(id: string): UsersSearchResponseBody['results'][number] {
  return { id, username: id, is_official_account: false }
}

function makePage(
  ids: string[],
  {
    endCursor = null,
    hasNextPage = false,
    muted = {},
  }: { endCursor?: string | null; hasNextPage?: boolean; muted?: Record<string, boolean> } = {},
): UsersSearchResponseBody {
  return {
    results: ids.map(makeUser),
    muted,
    page_info: {
      end_cursor: endCursor,
      has_next_page: hasNextPage,
      start_cursor: null,
    },
  }
}

describe('PaginatedUserSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards the cursor and the query, and appends unique users by stable ID', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['user-2']))

    render(
      <PaginatedUserSearchResults
        initialData={makePage(['user-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        query='ali'
        emptyTitle='No users found'
        emptyDescription='Try another username'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/users', {
      q: 'ali',
      limit: 25,
      after: 'cursor-1',
    })
    expect(screen.getByTestId('user-user-1')).toBeDefined()
    expect(screen.getByTestId('user-user-2')).toBeDefined()
  })

  it('merges the muted sidecar across pages, keeping first-page values on conflict', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(
      makePage(['user-2'], { muted: { 'user-1': false, 'user-2': true } }),
    )

    render(
      <PaginatedUserSearchResults
        initialData={makePage(['user-1'], {
          endCursor: 'cursor-1',
          hasNextPage: true,
          muted: { 'user-1': true },
        })}
        query='ali'
        emptyTitle='No users found'
        emptyDescription='Try another username'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(screen.getByTestId('muted-user-1')).toHaveTextContent('true')
    expect(screen.getByTestId('muted-user-2')).toHaveTextContent('true')
  })

  it('preserves the first page after failure and retries the continuation', async () => {
    vi.mocked(getPaginatedPage)
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(makePage(['user-2']))

    render(
      <PaginatedUserSearchResults
        initialData={makePage(['user-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        query='ali'
        emptyTitle='No users found'
        emptyDescription='Try another username'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(screen.getByTestId('user-user-1')).toBeDefined()
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })

    expect(await screen.findByTestId('user-user-2')).toBeDefined()
    expect(getPaginatedPage).toHaveBeenCalledTimes(2)
  })
})
