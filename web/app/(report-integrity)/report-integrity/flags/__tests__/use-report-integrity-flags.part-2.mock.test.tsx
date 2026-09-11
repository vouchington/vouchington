import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'

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

const { mockResolveFlag, mockApplyPenalty } = vi.hoisted(() => ({
  mockResolveFlag: vi.fn<VitestLooseMock>(),
  mockApplyPenalty: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  resolveReportIntegrityFlag: mockResolveFlag,
  applyReportAbusePenalty: mockApplyPenalty,
}))

const { mockUsePaginatedList } = vi.hoisted(() => ({
  mockUsePaginatedList: vi.fn<VitestLooseMock>(initialData => ({
    pages: [initialData],
    hasNextPage: initialData.page_info.has_next_page,
    endCursor: initialData.page_info.end_cursor,
    fetchError: null,
    clearError: vi.fn<VitestLooseMock>(),
    loadMore: vi.fn<VitestLooseMock>(),
  })),
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

import { useReportIntegrityFlags } from '../use-report-integrity-flags'

const makeFlag = (overrides: Record<string, unknown> = {}) => ({
  id: 'flag-1',
  post_id: null,
  reported_user_id: null,
  hostname_id: null,
  rss_feed_item_id: null,
  flag_type: 'mass_report_suspected' as const,
  reporter_count: 3,
  new_account_reporter_pct: 0.5,
  details: {},
  resolved_at: null,
  resolved_by_id: null,
  resolution: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

const makeInitialData = (flags: ReturnType<typeof makeFlag>[] = [makeFlag()]) => ({
  results: flags,
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
})

describe('useReportIntegrityFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handleResolve sets actionLoading during the request', async () => {
    let resolvePromise: (value: unknown) => void
    mockResolveFlag.mockReturnValueOnce(
      new Promise(resolve => {
        resolvePromise = resolve
      }),
    )

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })

    act(() => {
      result.current.handleResolve('flag-1').catch(() => {})
    })

    await waitFor(() => {
      expect(result.current.actionLoading['flag-1']).toBe(true)
    })

    await act(async () => {
      resolvePromise!({ flag: makeFlag() })
    })

    expect(result.current.actionLoading['flag-1']).toBe(false)
  })

  it('applyPenaltyWithConfirmation sets confirm state on first call', () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    expect(result.current.penaltyConfirm['flag-1']).toBe(true)
  })

  it('applyPenaltyWithConfirmation applies the penalty on second call', async () => {
    mockApplyPenalty.mockResolvedValueOnce({
      flag: makeFlag({ resolution: 'penalized' }),
      penalized_user_count: 2,
    })

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await act(async () => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await waitFor(() => {
      expect(mockApplyPenalty).toHaveBeenCalledWith('flag-1')
    })
  })

  it('applyPenaltyWithConfirmation updates the count and authoritative flag', async () => {
    mockApplyPenalty.mockResolvedValueOnce({
      flag: makeFlag({
        resolved_at: '2024-01-02T00:00:00Z',
        resolution: 'penalized',
      }),
      penalized_user_count: 5,
    })

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await act(async () => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await waitFor(() => {
      expect(result.current.penaltyResults['flag-1']).toBe(5)
      expect(result.current.flags).toEqual([])
    })
  })

  it('applyPenaltyWithConfirmation sets actionError on failure', async () => {
    mockApplyPenalty.mockRejectedValueOnce(new Error('Penalty error'))

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await act(async () => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await waitFor(() => {
      expect(result.current.actionError).toBe(
        'The result is uncertain. Reload before trying again.',
      )
    })
  })

  it('applyPenaltyWithConfirmation sets ApiError message on failure', async () => {
    mockApplyPenalty.mockRejectedValueOnce(new ApiError('Penalty failed', 500))

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await act(async () => {
      result.current.applyPenaltyWithConfirmation('flag-1')
    })

    await waitFor(() => {
      expect(result.current.actionError).toBe(
        'The result is uncertain. Reload before trying again.',
      )
    })
  })

  it('serializes investigate and resolve mutations for the same flag', async () => {
    let resolvePenalty: (value: unknown) => void
    mockApplyPenalty.mockReturnValueOnce(
      new Promise(resolve => {
        resolvePenalty = resolve
      }),
    )

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
      result.current.applyPenaltyWithConfirmation('flag-1')
    })
    act(() => {
      result.current.applyPenaltyWithConfirmation('flag-1')
      result.current.handleResolve('flag-1').catch(() => {})
    })

    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)
    expect(mockResolveFlag).not.toHaveBeenCalled()

    await act(async () => {
      resolvePenalty!({ flag: makeFlag(), penalized_user_count: 0 })
    })
  })

  it('dedupes flags by id across multiple pages', () => {
    const flag = makeFlag()
    mockUsePaginatedList.mockReturnValueOnce({
      pages: [
        { results: [flag], page_info: {} },
        { results: [flag], page_info: {} },
      ],
      hasNextPage: false,
      endCursor: null,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      loadMore: vi.fn<VitestLooseMock>(),
    })

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    expect(result.current.flags).toHaveLength(1)
  })
})
