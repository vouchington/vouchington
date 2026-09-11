import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import type { CommunitiesListResponseBody } from '@/types/api-responses'
import { getPaginatedPage } from '@/lib/api/client'
import { PaginatedUserCommunityList } from '../paginated-user-community-list'

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
  import('@/components/communities/community-card'),
  () =>
    ({
      CommunityCard: ({ community }: { community: { id: string } }) => <div>{community.id}</div>,
    }) as unknown as typeof import('@/components/communities/community-card'),
)

function makePage(
  ids: string[],
  {
    endCursor = null,
    hasNextPage = false,
  }: { endCursor?: string | null; hasNextPage?: boolean } = {},
): CommunitiesListResponseBody {
  return {
    results: ids.map(id => makeCommunity({ id, slug: id })),
    page_info: {
      end_cursor: endCursor,
      has_next_page: hasNextPage,
      start_cursor: null,
    },
  }
}

describe('PaginatedUserCommunityList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards the cursor and appends unique communities by stable ID', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(makePage(['community-1', 'community-2']))

    render(
      <PaginatedUserCommunityList
        initialData={makePage(['community-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/communities/member'
        emptyTitle='No member communities'
        emptyDescription='This user is not a member of any communities.'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/users/alice/communities/member', {
      after: 'cursor-1',
    })
    expect(screen.getAllByText('community-1')).toHaveLength(1)
    expect(screen.getByText('community-2')).toBeDefined()
  })

  it('preserves the first page after failure and retries the continuation', async () => {
    vi.mocked(getPaginatedPage)
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(makePage(['community-2']))

    render(
      <PaginatedUserCommunityList
        initialData={makePage(['community-1'], { endCursor: 'cursor-1', hasNextPage: true })}
        endpoint='/api/v1/users/alice/communities/member'
        emptyTitle='No member communities'
        emptyDescription='This user is not a member of any communities.'
      />,
    )

    await act(async () => {
      await receiveLoadMore.mock.calls.at(-1)![0]()
    })

    expect(screen.getByText('community-1')).toBeDefined()
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })

    expect(await screen.findByText('community-2')).toBeDefined()
    expect(getPaginatedPage).toHaveBeenCalledTimes(2)
  })
})
