import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import {
  isAmbiguousIntegrityMutationFailure,
  useIntegrityPenalties,
  type IntegrityPenaltyPage,
  type IntegrityPenaltyRecord,
  type IntegrityPenaltyStatus,
} from './use-integrity-penalties'

const mockReplace = vi.fn<VitestLooseMock>()
const mockRefresh = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

const penalty: IntegrityPenaltyRecord = {
  id: 'penalty-1',
  user_id: 'user-1',
  reason: 'voting_ring',
  source_flag_id: 'flag-1',
  created_by_id: 'admin-1',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
}
const initialData = {
  results: [penalty],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

function renderPenaltyHook(options?: {
  available?: boolean
  getById?: (id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>
  initialStatus?: IntegrityPenaltyStatus
  revoke?: (id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>
  scopeGuard?: (page: IntegrityPenaltyPage<IntegrityPenaltyRecord>) => boolean
}) {
  return renderHook(() =>
    useIntegrityPenalties({
      endpoint: '/api/v1/report-integrity/penalties',
      initialData,
      initialStatus: options?.initialStatus ?? 'active',
      listPath: '/report-integrity/penalties',
      available: options?.available,
      getById:
        options?.getById ??
        vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => ({
          penalty,
        })),
      revoke:
        options?.revoke ??
        vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => ({
          penalty,
        })),
      scopeGuard: options?.scopeGuard,
    }),
  )
}

describe('integrity penalty mutation classification', () => {
  it('keeps an unavailable scope empty and prevents revoke actions', async () => {
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>()
    const { result } = renderPenaltyHook({
      revoke,
      scopeGuard: () => false,
    })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(result.current.scopeAvailable).toBe(false)
    expect(result.current.penalties).toEqual([])
    expect(revoke).not.toHaveBeenCalled()
  })

  it('updates the selected status URL and refreshes through transitions', async () => {
    const { result } = renderPenaltyHook()

    await act(async () => result.current.handleStatusChange('active'))
    expect(result.current.selectedStatus).toBe('active')
    expect(mockReplace).toHaveBeenLastCalledWith('/report-integrity/penalties')

    await act(async () => result.current.handleStatusChange('revoked'))
    expect(result.current.selectedStatus).toBe('revoked')
    expect(mockReplace).toHaveBeenLastCalledWith('/report-integrity/penalties?status=revoked')

    await act(async () => result.current.handleRefresh())
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('treats transport, timeout, and server failures as ambiguous', () => {
    expect(isAmbiguousIntegrityMutationFailure(new Error('connection closed'))).toBe(true)
    expect(isAmbiguousIntegrityMutationFailure(new ApiError('timeout', 408))).toBe(true)
    expect(isAmbiguousIntegrityMutationFailure(new ApiError('server', 503))).toBe(true)
  })

  it('keeps definite client failures immediately retryable', () => {
    expect(isAmbiguousIntegrityMutationFailure(new ApiError('conflict', 409))).toBe(false)
  })

  it('reconciles an ambiguous revoke through the exact penalty endpoint', async () => {
    const revoked = { ...penalty, revoked_at: '2026-01-02T00:00:00.000Z' }
    const getById = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
      async () => ({ penalty: revoked }),
    )
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => {
      throw new ApiError('server', 503)
    })
    const { result } = renderPenaltyHook({ getById, revoke })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))
    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(getById).toHaveBeenCalledWith(penalty.id)
    expect(result.current.penalties).toEqual([])
    expect(result.current.reconciliationRequired[penalty.id]).toBe(false)
  })

  it.each([
    ['active', []],
    ['all', [{ ...penalty, revoked_at: '2026-01-02T00:00:00.000Z' }]],
  ] as const)(
    'reconciles an already-revoked DELETE from the %s ledger',
    async (initialStatus, expected) => {
      const revoked = { ...penalty, revoked_at: '2026-01-02T00:00:00.000Z' }
      const getById = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
        async () => ({ penalty: revoked }),
      )
      const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
        async () => {
          throw new ApiError('not found or already revoked', 404)
        },
      )
      const { result } = renderPenaltyHook({ getById, initialStatus, revoke })

      await act(async () => result.current.revokeWithConfirmation(penalty.id))
      await act(async () => result.current.revokeWithConfirmation(penalty.id))

      expect(revoke).toHaveBeenCalledOnce()
      expect(getById).toHaveBeenCalledWith(penalty.id)
      expect(result.current.penalties).toEqual(expected)
      expect(result.current.reconciliationRequired[penalty.id]).toBe(false)
      expect(result.current.actionLoading[penalty.id]).toBe(false)
    },
  )

  it('removes a listed row when the primary-backed exact read is not found', async () => {
    const getById = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
      async () => {
        throw new ApiError('not found', 404)
      },
    )
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => {
      throw new ApiError('not found or already revoked', 404)
    })
    const { result } = renderPenaltyHook({ getById, revoke })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))
    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(revoke).toHaveBeenCalledOnce()
    expect(getById).toHaveBeenCalledOnce()
    expect(result.current.penalties).toEqual([])
    expect(result.current.reconciliationRequired[penalty.id]).toBe(false)
    expect(result.current.actionLoading[penalty.id]).toBe(false)
  })

  it('keeps reconciliation pending when the exact read has another 4xx failure', async () => {
    const getById = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
      async () => {
        throw new ApiError('forbidden', 403)
      },
    )
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => {
      throw new ApiError('not found or already revoked', 404)
    })
    const { result } = renderPenaltyHook({ getById, revoke })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))
    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(revoke).toHaveBeenCalledOnce()
    expect(getById).toHaveBeenCalledOnce()
    expect(result.current.penalties).toEqual([penalty])
    expect(result.current.reconciliationRequired[penalty.id]).toBe(true)
    expect(result.current.actionLoading[penalty.id]).toBe(true)
  })

  it('keeps a definite 4xx failure visible and retryable without reconciliation', async () => {
    const getById = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
      async () => ({
        penalty,
      }),
    )
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => {
      throw new ApiError('conflict', 409)
    })
    const { result } = renderPenaltyHook({ getById, revoke })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))
    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(getById).not.toHaveBeenCalled()
    expect(result.current.penalties).toHaveLength(1)
    expect(result.current.actionLoading[penalty.id]).toBe(false)
  })

  it('replaces a penalty from a confirmed revoke when revoked rows remain visible', async () => {
    const revoked = { ...penalty, revoked_at: '2026-01-02T00:00:00.000Z' }
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(
      async () => ({
        penalty: revoked,
      }),
    )
    const { result } = renderPenaltyHook({ initialStatus: 'all', revoke })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))
    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(result.current.penalties).toEqual([revoked])
    expect(result.current.actionLoading[penalty.id]).toBe(false)
  })

  it.each(['revoked', 'all'] as const)(
    'shows a revoked penalty after switching from active to %s',
    async nextStatus => {
      const revoked = { ...penalty, revoked_at: '2026-01-02T00:00:00.000Z' }
      const revoke = vi.fn<() => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => ({
        penalty: revoked,
      }))
      const { result, rerender } = renderHook(
        ({ data, status }: { data: typeof initialData; status: IntegrityPenaltyStatus }) =>
          useIntegrityPenalties({
            endpoint: '/api/v1/report-integrity/penalties',
            initialData: data,
            initialStatus: status,
            listPath: '/report-integrity/penalties',
            getById: vi.fn<() => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => ({
              penalty: revoked,
            })),
            revoke,
          }),
        { initialProps: { data: initialData, status: 'active' as IntegrityPenaltyStatus } },
      )

      await act(async () => result.current.revokeWithConfirmation(penalty.id))
      await act(async () => result.current.revokeWithConfirmation(penalty.id))
      const revokedData = { ...initialData, results: [revoked] }
      rerender({ data: revokedData, status: 'active' })
      expect(result.current.penalties).toEqual([])

      rerender({ data: revokedData, status: nextStatus })
      expect(result.current.penalties).toEqual([revoked])
    },
  )

  it('keeps an uncertain result locked until reconciliation later succeeds', async () => {
    const revoked = { ...penalty, revoked_at: '2026-01-02T00:00:00.000Z' }
    const getById = vi
      .fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>()
      .mockRejectedValueOnce(new Error('GET unavailable'))
      .mockResolvedValueOnce({ penalty: revoked })
    const revoke = vi.fn<(id: string) => Promise<{ penalty: IntegrityPenaltyRecord }>>(async () => {
      throw new ApiError('server', 503)
    })
    const { result } = renderPenaltyHook({ getById, revoke })

    await act(async () => result.current.revokeWithConfirmation(penalty.id))
    await act(async () => result.current.revokeWithConfirmation(penalty.id))

    expect(result.current.reconciliationRequired[penalty.id]).toBe(true)
    expect(result.current.actionErrors[penalty.id]).toBeTruthy()
    expect(result.current.actionLoading[penalty.id]).toBe(true)

    await act(async () => result.current.reconcile(penalty.id))

    expect(result.current.penalties).toEqual([])
    expect(result.current.reconciliationRequired[penalty.id]).toBe(false)
    expect(result.current.actionLoading[penalty.id]).toBe(false)
  })
})
