import type { ReactNode } from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FollowerSendPicker } from '../follower-send-picker'

import { fetchFollowerUsers } from '@/lib/api/client/users'

interface EntityAutocompleteMockProps {
  search: (query: string, signal: AbortSignal) => Promise<{ id: string }[]>
  results?: { id: string; username?: string | null }[]
  footer?: ReactNode
}

let latestSearch: EntityAutocompleteMockProps['search'] | null = null

vi.mock(import('@/lib/api/client/users'), () => ({
  fetchFollowerUsers: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/shared/entity-autocomplete'),
  () =>
    ({
      EntityAutocomplete: ({ search, results = [], footer }: EntityAutocompleteMockProps) => {
        latestSearch = search
        return (
          <div>
            {results.map(follower => (
              <div key={follower.id}>{follower.username ?? follower.id}</div>
            ))}
            {footer}
          </div>
        )
      },
    }) as unknown as typeof import('@/components/shared/entity-autocomplete'),
)

vi.mock(
  import('@/components/shared/user-avatar'),
  () =>
    ({ UserAvatar: () => <div /> }) as unknown as typeof import('@/components/shared/user-avatar'),
)

function page(
  results: { id: string; username: string }[],
  hasNextPage: boolean,
  endCursor: string | null,
) {
  return {
    results,
    page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
  }
}

async function search(query: string) {
  await act(async () => {
    await latestSearch?.(query, new AbortController().signal)
  })
}

describe('FollowerSendPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    latestSearch = null
  })

  it('appends unique follower results from the next cursor page', async () => {
    vi.mocked(fetchFollowerUsers)
      .mockResolvedValueOnce(page([{ id: 'alpha', username: 'alpha' }], true, 'cursor-1'))
      .mockResolvedValueOnce(
        page(
          [
            { id: 'alpha', username: 'alpha' },
            { id: 'beta', username: 'beta' },
          ],
          false,
          null,
        ),
      )

    render(
      <FollowerSendPicker
        currentUserId='user-1'
        selectedFollowers={[]}
        onToggleFollowerSelection={vi.fn<VitestLooseMock>()}
      />,
    )

    await search('')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(fetchFollowerUsers).toHaveBeenLastCalledWith('user-1', {
        after: 'cursor-1',
        q: undefined,
        limit: 5,
        signal: expect.any(AbortSignal),
      })
    })
    await screen.findByText('beta')
    expect(screen.getAllByText('alpha')).toHaveLength(1)
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('ignores a stale cursor page after the query changes', async () => {
    let resolveNextPage!: (value: ReturnType<typeof page>) => void
    vi.mocked(fetchFollowerUsers)
      .mockResolvedValueOnce(page([{ id: 'alpha', username: 'alpha' }], true, 'cursor-1'))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveNextPage = resolve
          }),
      )
      .mockResolvedValueOnce(page([{ id: 'beta', username: 'beta' }], false, null))

    render(
      <FollowerSendPicker
        currentUserId='user-1'
        selectedFollowers={[]}
        onToggleFollowerSelection={vi.fn<VitestLooseMock>()}
      />,
    )

    await search('')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(fetchFollowerUsers).toHaveBeenCalledTimes(2))

    await search('beta')
    await act(async () => resolveNextPage(page([{ id: 'stale', username: 'stale' }], false, null)))

    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.queryByText('stale')).not.toBeInTheDocument()
  })

  it('preserves results and retries a failed cursor page', async () => {
    vi.mocked(fetchFollowerUsers)
      .mockResolvedValueOnce(page([{ id: 'alpha', username: 'alpha' }], true, 'cursor-1'))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(page([{ id: 'beta', username: 'beta' }], false, null))

    render(
      <FollowerSendPicker
        currentUserId='user-1'
        selectedFollowers={[]}
        onToggleFollowerSelection={vi.fn<VitestLooseMock>()}
      />,
    )

    await search('')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('alert')

    expect(screen.getByText('alpha')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('beta')

    expect(fetchFollowerUsers).toHaveBeenLastCalledWith('user-1', {
      after: 'cursor-1',
      q: undefined,
      limit: 5,
      signal: expect.any(AbortSignal),
    })
  })
})
