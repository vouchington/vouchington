import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const mocks = vi.hoisted(() => ({
  applyPenalty: vi.fn<VitestLooseMock>(),
  getFlag: vi.fn<VitestLooseMock>(),
  resolveFlag: vi.fn<VitestLooseMock>(),
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  applyReportAbusePenalty: mocks.applyPenalty,
  getReportIntegrityFlagClient: mocks.getFlag,
  resolveReportIntegrityFlag: mocks.resolveFlag,
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mocks.usePaginatedList,
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

describe('useReportIntegrityFlags reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.usePaginatedList.mockImplementation((initialData, _endpoint, params) => ({
      pages: [initialData],
      hasNextPage: false,
      endCursor: null,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      loadMore: vi.fn<VitestLooseMock>(),
      params,
    }))
  })

  it('keeps an authoritatively resolved flag visible outside the pending queue', async () => {
    const resolvedFlag = makeFlag({
      resolved_at: '2026-07-17T01:00:00.000Z',
      resolution: 'dismissed',
    })
    mocks.resolveFlag.mockResolvedValueOnce({ flag: resolvedFlag })
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'resolved'))

    act(() => result.current.updateResolution('flag-1', 'dismissed'))
    await act(async () => result.current.handleResolve('flag-1'))

    expect(result.current.flags).toEqual([resolvedFlag])
    expect(result.current.actionLoading['flag-1']).toBe(false)
  })

  it('surfaces failed reconciliation and applies the authoritative flag on retry', async () => {
    const resolvedFlag = makeFlag({
      resolved_at: '2026-07-17T01:00:00.000Z',
      resolution: 'dismissed',
    })
    mocks.resolveFlag.mockRejectedValueOnce(new Error('connection closed'))
    mocks.getFlag
      .mockRejectedValueOnce(new Error('still unavailable'))
      .mockResolvedValueOnce({ flag: resolvedFlag })
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.updateResolution('flag-1', 'dismissed'))
    await act(async () => result.current.handleResolve('flag-1'))

    expect(result.current.reconciliationRequired['flag-1']).toBe(true)
    expect(result.current.actionLoading['flag-1']).toBe(true)
    expect(result.current.actionError).toBe('The result is uncertain. Reload before trying again.')

    await act(async () => result.current.retryReconciliation('flag-1'))

    expect(mocks.getFlag).toHaveBeenCalledTimes(2)
    expect(result.current.reconciliationRequired['flag-1']).toBe(false)
    expect(result.current.actionLoading['flag-1']).toBe(false)
    expect(result.current.actionError).toBeNull()
    expect(result.current.flags).toEqual([])
  })

  it('reconciles an ambiguous penalty without allowing the destructive action to repeat', async () => {
    const penalizedFlag = makeFlag({
      resolved_at: '2026-07-17T01:00:00.000Z',
      resolution: 'penalized',
    })
    mocks.applyPenalty.mockRejectedValueOnce(new Error('connection closed'))
    mocks.getFlag.mockResolvedValueOnce({ flag: penalizedFlag })
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await waitFor(() => expect(result.current.flags).toEqual([]))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))

    expect(mocks.applyPenalty).toHaveBeenCalledOnce()
    expect(result.current.reconciliationRequired['flag-1']).toBe(false)
    expect(result.current.actionError).toBeNull()
  })

  it('allows a penalty retry when exact reconciliation proves the flag is still pending', async () => {
    const penalizedFlag = makeFlag({
      resolved_at: '2026-07-17T01:00:00.000Z',
      resolution: 'penalized',
    })
    let completeRetry!: (value: {
      flag: ReturnType<typeof makeFlag>
      penalized_user_count: number
    }) => void
    const retryResponse = new Promise<{
      flag: ReturnType<typeof makeFlag>
      penalized_user_count: number
    }>(resolve => {
      completeRetry = resolve
    })
    mocks.applyPenalty
      .mockRejectedValueOnce(new Error('connection closed'))
      .mockReturnValueOnce(retryResponse)
    mocks.getFlag.mockResolvedValueOnce({ flag: makeFlag() })
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await waitFor(() => expect(result.current.actionLoading['flag-1']).toBe(false))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await waitFor(() => expect(mocks.applyPenalty).toHaveBeenCalledTimes(2))
    expect(result.current.penaltyResults['flag-1']).toBeUndefined()

    await act(async () => {
      completeRetry({ flag: penalizedFlag, penalized_user_count: 3 })
    })

    expect(mocks.getFlag).toHaveBeenCalledOnce()
    await waitFor(() => expect(result.current.penaltyResults['flag-1']).toBe(3))
  })

  it('keeps failed penalty reconciliation GET-only and blocks the penalty retry', async () => {
    mocks.applyPenalty.mockRejectedValueOnce(new Error('connection closed'))
    mocks.getFlag.mockRejectedValue(new Error('GET unavailable'))
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await waitFor(() => expect(result.current.reconciliationRequired['flag-1']).toBe(true))

    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    await act(async () => result.current.retryReconciliation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))
    act(() => result.current.applyPenaltyWithConfirmation('flag-1'))

    expect(mocks.getFlag).toHaveBeenCalledTimes(2)
    expect(mocks.applyPenalty).toHaveBeenCalledOnce()
    expect(result.current.reconciliationRequired['flag-1']).toBe(true)
    expect(result.current.actionLoading['flag-1']).toBe(true)
  })

  it('omits the initial status pagination parameter for the all view', () => {
    renderHook(() => useReportIntegrityFlags(makeInitialData(), 'all'))

    expect(mocks.usePaginatedList).toHaveBeenCalledWith(
      makeInitialData(),
      '/api/v1/report-integrity/flags',
      { status: undefined },
    )
  })
})
