import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import type { StatusFilter } from '@/types/vote-integrity'

const mockReplace = vi.fn<VitestLooseMock>()
const mockRefresh = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        replace: mockReplace,
        refresh: mockRefresh,
      }),
    }) as unknown as typeof import('next/navigation'),
)

const { mockApplyPenalty, mockResolveFlag, mockGetFlag, mockGetPenalties } = vi.hoisted(() => ({
  mockApplyPenalty: vi.fn<VitestLooseMock>(),
  mockResolveFlag: vi.fn<VitestLooseMock>(),
  mockGetFlag: vi.fn<VitestLooseMock>(),
  mockGetPenalties: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/vote-integrity'), () => ({
  applyVoteRingPenalty: mockApplyPenalty,
  resolveVoteIntegrityFlag: mockResolveFlag,
  getVoteIntegrityFlagClient: mockGetFlag,
  getVoteIntegrityPenaltiesClient: mockGetPenalties,
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(initialData => ({
    pages: [initialData],
    hasNextPage: false,
    endCursor: null,
    fetchError: null,
    clearError: vi.fn<VitestLooseMock>(),
    loadMore: vi.fn<VitestLooseMock>(),
  })),
}))

import { useVoteIntegrityFlags } from '../use-vote-integrity-flags'

function makeFlag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flag-1',
    post_id: 'post-1',
    topic_id: null,
    hostname_id: null,
    rss_feed_item_id: null,
    entity_relation_id: null,
    agent_moderation_id: null,
    flag_type: 'velocity_spike' as const,
    details: {},
    resolved_at: null,
    resolved_by_id: null,
    resolution: null,
    created_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  }
}

function makeInitialData(flags = [makeFlag()]) {
  return {
    results: flags,
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

describe('useVoteIntegrityFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApplyPenalty.mockResolvedValue({ penalized_user_count: 1 })
    mockGetFlag.mockResolvedValue({ flag: makeFlag() })
    mockGetPenalties.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      filter_scope: { source: 'flag', source_flag_id: 'flag-1' },
    })
  })

  it('replaces a row only from a confirmed resolution response', async () => {
    mockResolveFlag.mockResolvedValueOnce({
      flag: makeFlag({
        resolved_at: '2026-07-16T01:00:00.000Z',
        resolved_by_id: 'admin-1',
        resolution: 'suspended',
      }),
    })
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'suspended')
    })
    await act(async () => {
      await result.current.handleResolve('flag-1')
    })

    expect(result.current.flags).toEqual([])
  })

  it.each(['resolved', 'all'] as const)(
    'shows a resolved flag after switching from pending to %s',
    async nextStatus => {
      const resolvedFlag = makeFlag({
        resolved_at: '2026-07-16T01:00:00.000Z',
        resolved_by_id: 'admin-1',
        resolution: 'suspended',
      })
      mockResolveFlag.mockResolvedValueOnce({ flag: resolvedFlag })
      const { result, rerender } = renderHook(
        ({ data, status }: { data: ReturnType<typeof makeInitialData>; status: StatusFilter }) =>
          useVoteIntegrityFlags(data, status),
        { initialProps: { data: makeInitialData(), status: 'pending' as StatusFilter } },
      )

      act(() => result.current.updateResolution('flag-1', 'suspended'))
      await act(async () => result.current.handleResolve('flag-1'))
      rerender({ data: makeInitialData([resolvedFlag]), status: 'pending' })
      expect(result.current.flags).toEqual([])

      rerender({ data: makeInitialData([resolvedFlag]), status: nextStatus })
      expect(result.current.flags).toEqual([resolvedFlag])
    },
  )

  it('keeps resolution state unchanged after a successful ring penalty', async () => {
    mockApplyPenalty.mockResolvedValueOnce({ penalized_user_count: 4 })
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await waitFor(() => {
      expect(result.current.penaltyResults['flag-1']).toBe(4)
    })
    expect(result.current.flags[0]).toMatchObject({
      resolution: null,
      resolved_at: null,
      resolved_by_id: null,
    })
  })

  it('serializes resolution and penalty mutations for the same flag', async () => {
    let resolveAction: (value: unknown) => void
    mockResolveFlag.mockReturnValueOnce(
      new Promise(resolve => {
        resolveAction = resolve
      }),
    )
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })
    act(() => {
      result.current.handleResolve('flag-1').catch(() => {})
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    expect(mockResolveFlag).toHaveBeenCalledTimes(1)
    expect(mockApplyPenalty).not.toHaveBeenCalled()

    await act(async () => {
      resolveAction!({ flag: makeFlag() })
    })
  })

  it('prevents two invocations of the same vote penalty action', async () => {
    let finishPenalty: (value: unknown) => void
    mockApplyPenalty.mockReturnValueOnce(
      new Promise(resolve => {
        finishPenalty = resolve
      }),
    )
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await waitFor(() => expect(mockApplyPenalty).toHaveBeenCalledTimes(1))

    await act(async () => {
      finishPenalty!({ penalized_user_count: 1 })
    })
  })

  it('uses the canonical ApiError payload message and releases the lock for retry', async () => {
    mockApplyPenalty
      .mockRejectedValueOnce(new ApiError('generic', 409, { error: 'Penalty already applied' }))
      .mockResolvedValueOnce({ penalized_user_count: 1 })
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    await waitFor(() => {
      expect(result.current.actionError).toBe('Penalty already applied')
    })

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    await waitFor(() => {
      expect(result.current.penaltyResults['flag-1']).toBe(1)
    })
    expect(mockApplyPenalty).toHaveBeenCalledTimes(2)
  })

  it('reconciles an ambiguous resolution instead of presenting a definite failure', async () => {
    mockResolveFlag.mockRejectedValueOnce(new ApiError('server', 503))
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.updateResolution('flag-1', 'dismissed'))
    await act(async () => result.current.handleResolve('flag-1'))

    expect(mockGetFlag).toHaveBeenCalledWith('flag-1')
    expect(result.current.reconciliationRequired['flag-1']).toBe(false)
    expect(result.current.actionErrors['flag-1']).toBeFalsy()
  })

  it('surfaces a definite resolution failure without reconciliation', async () => {
    mockResolveFlag.mockRejectedValueOnce(
      new ApiError('generic', 409, { error: 'Flag was already resolved' }),
    )
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.updateResolution('flag-1', 'dismissed'))
    await act(async () => result.current.handleResolve('flag-1'))

    expect(mockGetFlag).not.toHaveBeenCalled()
    expect(result.current.actionErrors['flag-1']).toBe('Flag was already resolved')
  })

  it('never unlocks a known-success zero-count penalty when confirmation needs reconciliation', async () => {
    mockApplyPenalty.mockResolvedValueOnce({ penalized_user_count: 0 })
    mockGetFlag.mockRejectedValueOnce(new Error('GET unavailable'))
    const { result } = renderHook(() => useVoteIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))

    await waitFor(() => {
      expect(result.current.reconciliationRequired['flag-1']).toBe(true)
    })
    expect(result.current.penaltyResults['flag-1']).toBe(0)

    await act(async () => result.current.retryReconciliation('flag-1'))
    expect(result.current.reconciliationRequired['flag-1']).toBe(false)

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await act(async () => {})

    expect(mockApplyPenalty).toHaveBeenCalledOnce()
  })
})
