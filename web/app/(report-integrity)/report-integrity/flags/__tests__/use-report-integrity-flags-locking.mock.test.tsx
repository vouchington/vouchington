import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        replace: vi.fn<VitestLooseMock>(),
        refresh: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

const { mockApplyPenalty, mockResolveFlag, mockGetFlag } = vi.hoisted(() => ({
  mockApplyPenalty: vi.fn<VitestLooseMock>(),
  mockResolveFlag: vi.fn<VitestLooseMock>(),
  mockGetFlag: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  applyReportAbusePenalty: mockApplyPenalty,
  resolveReportIntegrityFlag: mockResolveFlag,
  getReportIntegrityFlagClient: mockGetFlag,
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

import { useReportIntegrityFlags } from '../use-report-integrity-flags'

function makeFlag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flag-1',
    post_id: null,
    reported_user_id: 'user-1',
    hostname_id: null,
    rss_feed_item_id: null,
    flag_type: 'mass_report_suspected' as const,
    reporter_count: 3,
    new_account_reporter_pct: 0.5,
    details: {},
    resolved_at: null,
    resolved_by_id: null,
    resolution: null,
    created_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  }
}

function makeInitialData() {
  return {
    results: [makeFlag()],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

describe('useReportIntegrityFlags action locking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFlag.mockResolvedValue({ flag: makeFlag() })
  })

  it('prevents two invocations of the same resolve action', async () => {
    let finishResolve: (value: unknown) => void
    mockResolveFlag.mockReturnValueOnce(
      new Promise(resolve => {
        finishResolve = resolve
      }),
    )
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })
    act(() => {
      result.current.handleResolve('flag-1').catch(() => {})
      result.current.handleResolve('flag-1').catch(() => {})
    })

    expect(mockResolveFlag).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishResolve!({ flag: makeFlag({ resolution: 'dismissed' }) })
    })
  })

  it('prevents two invocations of the same reporter-penalty action', async () => {
    let finishPenalty: (value: unknown) => void
    mockApplyPenalty.mockReturnValueOnce(
      new Promise(resolve => {
        finishPenalty = resolve
      }),
    )
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishPenalty!({ flag: makeFlag({ resolution: 'penalized' }), penalized_user_count: 1 })
    })
  })

  it('releases the report penalty lock after failure and permits a retry', async () => {
    mockApplyPenalty
      .mockRejectedValueOnce(new ApiError('generic', 409, { error: 'Flag is already resolved' }))
      .mockResolvedValueOnce({
        flag: makeFlag({
          resolved_at: '2026-07-17T01:00:00.000Z',
          resolution: 'penalized',
        }),
        penalized_user_count: 1,
      })
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    await waitFor(() => {
      expect(result.current.actionError).toBe('Flag is already resolved')
      expect(result.current.actionLoading['flag-1']).toBe(false)
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

  it('reconciles an ambiguous reporter penalty without submitting it again', async () => {
    mockApplyPenalty.mockRejectedValueOnce(new Error('connection closed'))
    mockGetFlag.mockResolvedValueOnce({
      flag: makeFlag({
        resolved_at: '2026-07-17T01:00:00.000Z',
        resolution: 'penalized',
      }),
    })
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await waitFor(() => expect(mockGetFlag).toHaveBeenCalledWith('flag-1'))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))

    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)
    expect(result.current.reconciliationRequired['flag-1']).toBe(false)
  })
})
