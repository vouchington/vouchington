import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import type { StatusFilter } from '@/types/report-integrity'

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

const { mockResolveFlag, mockApplyPenalty, mockGetFlag } = vi.hoisted(() => ({
  mockResolveFlag: vi.fn<VitestLooseMock>(),
  mockApplyPenalty: vi.fn<VitestLooseMock>(),
  mockGetFlag: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  resolveReportIntegrityFlag: mockResolveFlag,
  applyReportAbusePenalty: mockApplyPenalty,
  getReportIntegrityFlagClient: mockGetFlag,
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
    mockGetFlag.mockResolvedValue({ flag: makeFlag() })
  })

  it('exposes initial flags from initialData', () => {
    const initialData = makeInitialData()
    const { result } = renderHook(() => useReportIntegrityFlags(initialData, 'pending'))

    expect(result.current.flags).toHaveLength(1)
    expect(result.current.flags[0]!.id).toBe('flag-1')
  })

  it('exposes initial selectedStatus', () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'resolved'))

    expect(result.current.selectedStatus).toBe('resolved')
  })

  it('handleStatusChange updates selectedStatus and calls router.replace for non-pending', async () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    await act(async () => {
      result.current.handleStatusChange('resolved')
    })

    expect(result.current.selectedStatus).toBe('resolved')
    expect(mockReplace).toHaveBeenCalledWith('/report-integrity/flags?status=resolved')
  })

  it('handleStatusChange omits query string for pending', async () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'resolved'))

    await act(async () => {
      result.current.handleStatusChange('pending')
    })

    expect(mockReplace).toHaveBeenCalledWith('/report-integrity/flags')
  })

  it('handleStatusChange appends status=all for all filter', async () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    await act(async () => {
      result.current.handleStatusChange('all')
    })

    expect(mockReplace).toHaveBeenCalledWith('/report-integrity/flags?status=all')
  })

  it('handleRefreshFlags calls router.refresh', async () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    await act(async () => {
      result.current.handleRefreshFlags()
    })

    expect(mockRefresh).toHaveBeenCalled()
  })

  it('updateResolution sets the resolution for a flag', async () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })

    expect(result.current.resolutions['flag-1']).toBe('dismissed')
  })

  it('handleResolve does nothing when no resolution is set for the flag', async () => {
    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    await act(async () => {
      await result.current.handleResolve('flag-1')
    })

    expect(mockResolveFlag).not.toHaveBeenCalled()
  })

  it('handleResolve calls resolveReportIntegrityFlag and updates flag', async () => {
    const resolvedFlag = makeFlag({ resolved_at: '2024-01-02T00:00:00Z', resolution: 'dismissed' })
    mockResolveFlag.mockResolvedValueOnce({ flag: resolvedFlag })

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })

    await act(async () => {
      await result.current.handleResolve('flag-1')
    })

    expect(mockResolveFlag).toHaveBeenCalledWith('flag-1', 'dismissed')
    expect(result.current.flags).toEqual([])
  })

  it.each(['resolved', 'all'] as const)(
    'shows a resolved flag after switching from pending to %s',
    async nextStatus => {
      const resolvedFlag = makeFlag({
        resolved_at: '2024-01-02T00:00:00Z',
        resolution: 'dismissed',
      })
      mockResolveFlag.mockResolvedValueOnce({ flag: resolvedFlag })
      const { result, rerender } = renderHook(
        ({ data, status }: { data: ReturnType<typeof makeInitialData>; status: StatusFilter }) =>
          useReportIntegrityFlags(data, status),
        { initialProps: { data: makeInitialData(), status: 'pending' as StatusFilter } },
      )

      act(() => result.current.updateResolution('flag-1', 'dismissed'))
      await act(async () => result.current.handleResolve('flag-1'))
      rerender({ data: makeInitialData([resolvedFlag]), status: 'pending' })
      expect(result.current.flags).toEqual([])

      rerender({ data: makeInitialData([resolvedFlag]), status: nextStatus })
      expect(result.current.flags).toEqual([resolvedFlag])
    },
  )

  it('handleResolve reconciles an ambiguous transport failure through exact GET', async () => {
    mockResolveFlag.mockRejectedValueOnce(new Error('Server error'))

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })

    await act(async () => {
      await result.current.handleResolve('flag-1')
    })

    expect(mockGetFlag).toHaveBeenCalledWith('flag-1')
    expect(result.current.actionError).toBeNull()
  })

  it('handleResolve sets actionError with ApiError message', async () => {
    mockResolveFlag.mockRejectedValueOnce(new ApiError('Custom error', 400))

    const { result } = renderHook(() => useReportIntegrityFlags(makeInitialData(), 'pending'))

    act(() => {
      result.current.updateResolution('flag-1', 'dismissed')
    })

    await act(async () => {
      await result.current.handleResolve('flag-1')
    })

    expect(result.current.actionError).toBe('Custom error')
  })
})
