import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClearError, mockLoadMore } = vi.hoisted(() => ({
  mockClearError: vi.fn<() => void>(),
  mockLoadMore: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    clearError,
    fetchError,
    onLoadMore,
  }: {
    children: ReactNode
    clearError?: () => void
    fetchError?: Error | null
    onLoadMore: () => Promise<void | boolean>
  }) => (
    <div>
      {children}
      {fetchError ? (
        <div>
          <p role='alert'>Failed to load more</p>
          <button
            type='button'
            onClick={() => {
              clearError?.()
              void onLoadMore()
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  ),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('../use-vote-integrity-flags'), () => ({
  useVoteIntegrityFlags: vi.fn<VitestLooseMock>(() => ({
    actionErrors: {},
    actionLoading: {},
    applyPenaltyWithConfirmation: vi.fn<VitestLooseMock>(),
    clearError: mockClearError,
    endCursor: 'next-cursor',
    fetchError: new Error('Load failed'),
    flags: [],
    handleLoadMore: mockLoadMore,
    handleRefreshFlags: vi.fn<VitestLooseMock>(),
    handleResolve: vi.fn<VitestLooseMock>(),
    handleStatusChange: vi.fn<VitestLooseMock>(),
    hasNextPage: true,
    isPending: false,
    loadingMore: false,
    penaltyApplied: {},
    penaltyConfirm: {},
    penaltyResults: {},
    reconciliationRequired: {},
    resetKey: Symbol('vote-integrity-pagination'),
    resolutions: {},
    retryReconciliation: vi.fn<VitestLooseMock>(),
    selectedStatus: 'pending' as const,
    updateResolution: vi.fn<VitestLooseMock>(),
  })),
}))

import { VoteIntegrityFlagsClient } from '../vote-integrity-flags-client'

const emptyData = {
  results: [],
  page_info: { has_next_page: true, end_cursor: 'next-cursor', start_cursor: null },
}

describe('VoteIntegrityFlagsClient fetchError handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes continuation failure retry through the shared infinite-scroll action', async () => {
    render(
      <VoteIntegrityFlagsClient
        initialData={emptyData}
        initialStatus='pending'
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalledOnce()
      expect(mockLoadMore).toHaveBeenCalledOnce()
    })
  })
})
