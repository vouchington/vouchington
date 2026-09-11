import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import type { VoteIntegrityPenaltiesResponse, VoteIntegrityPenalty } from '@/types/vote-integrity'

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

const { mockApplyPenalty, mockGetFlag, mockGetPenalties } = vi.hoisted(() => ({
  mockApplyPenalty: vi.fn<VitestLooseMock>(),
  mockGetFlag: vi.fn<VitestLooseMock>(),
  mockGetPenalties: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/vote-integrity'), () => ({
  applyVoteRingPenalty: mockApplyPenalty,
  getVoteIntegrityFlagClient: mockGetFlag,
  getVoteIntegrityPenaltiesClient: mockGetPenalties,
  resolveVoteIntegrityFlag: vi.fn<VitestLooseMock>(),
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

const flag = {
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
}

const initialData = {
  results: [flag],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

const committedPenalty: VoteIntegrityPenalty = {
  id: 'penalty-1',
  user_id: 'user-1',
  penalty_multiplier: 0.5,
  reason: 'voting_ring',
  source_flag_id: flag.id,
  created_by_id: 'admin-1',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-07-16T00:01:00.000Z',
}

const oldRevokedPenalty: VoteIntegrityPenalty = {
  ...committedPenalty,
  id: 'penalty-old',
  revoked_at: '2026-07-16T00:02:00.000Z',
  revoked_by_id: 'admin-2',
}

function makePenaltyResponse(
  results = [committedPenalty],
  filterScope: { source: string; source_flag_id: string | null } | null = {
    source: 'flag',
    source_flag_id: flag.id,
  },
  pageInfo: VoteIntegrityPenaltiesResponse['page_info'] = {
    has_next_page: false,
    end_cursor: null,
    start_cursor: null,
  },
) {
  return {
    results,
    page_info: pageInfo,
    ...(filterScope ? { filter_scope: filterScope } : {}),
  }
}

function confirmPenalty(result: ReturnType<typeof renderVoteHook>['result']) {
  act(() => result.current.applyPenaltyWithConfirmation(flag.id))
  act(() => result.current.applyPenaltyWithConfirmation(flag.id))
}

function renderVoteHook() {
  return renderHook(() => useVoteIntegrityFlags(initialData, 'pending'))
}

describe('vote integrity penalty reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApplyPenalty.mockReset()
    mockGetFlag.mockReset()
    mockGetPenalties.mockReset()
    mockGetFlag.mockResolvedValue({ flag })
    mockGetPenalties.mockResolvedValue(makePenaltyResponse([]))
  })

  it.each([
    ['server failure', new ApiError('server', 503)],
    ['response decode failure', new SyntaxError('invalid JSON')],
  ])('suppresses a second penalty POST after an ambiguous %s', async (_label, failure) => {
    mockApplyPenalty.mockRejectedValueOnce(failure)
    mockGetPenalties
      .mockResolvedValueOnce(makePenaltyResponse([]))
      .mockResolvedValueOnce(makePenaltyResponse([committedPenalty]))
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(mockGetFlag).toHaveBeenCalledWith(flag.id))
    confirmPenalty(result)

    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)
    expect(mockGetPenalties).toHaveBeenCalledWith({ sourceFlagId: flag.id })
    expect(result.current.reconciliationRequired[flag.id]).toBe(false)
    expect(result.current.penaltyApplied[flag.id]).toBe(true)
  })

  it('allows a retry when an old revoked penalty exists and the request never arrived', async () => {
    mockApplyPenalty
      .mockRejectedValueOnce(new Error('connection closed'))
      .mockResolvedValueOnce({ penalized_user_count: 2 })
    mockGetPenalties
      .mockResolvedValueOnce(
        makePenaltyResponse([oldRevokedPenalty], undefined, {
          has_next_page: true,
          end_cursor: 'baseline-cursor',
          start_cursor: 'baseline-start',
        }),
      )
      .mockResolvedValueOnce(makePenaltyResponse([]))
      .mockResolvedValueOnce(makePenaltyResponse([oldRevokedPenalty]))
      .mockResolvedValueOnce(makePenaltyResponse([oldRevokedPenalty]))
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.actionLoading[flag.id]).toBe(false))
    confirmPenalty(result)
    await waitFor(() => expect(mockApplyPenalty).toHaveBeenCalledTimes(2))

    expect(mockGetPenalties).toHaveBeenCalledTimes(4)
    expect(mockGetPenalties).toHaveBeenNthCalledWith(2, {
      sourceFlagId: flag.id,
      after: 'baseline-cursor',
    })
    expect(result.current.penaltyApplied[flag.id]).toBeUndefined()
    await waitFor(() => expect(result.current.penaltyResults[flag.id]).toBe(2))
  })

  it.each([
    ['missing', null],
    ['mismatched', { source: 'flag', source_flag_id: 'flag-2' }],
  ])('prevents the POST when the baseline scope is %s', async (_label, filterScope) => {
    mockGetPenalties.mockResolvedValueOnce(makePenaltyResponse([], filterScope))
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.actionLoading[flag.id]).toBe(false))

    expect(mockApplyPenalty).not.toHaveBeenCalled()
    expect(result.current.reconciliationRequired[flag.id]).toBeUndefined()
  })

  it('prevents the POST when baseline pagination has no continuation cursor', async () => {
    mockGetPenalties.mockResolvedValueOnce(
      makePenaltyResponse([], undefined, {
        has_next_page: true,
        end_cursor: null,
        start_cursor: 'baseline-start',
      }),
    )
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.actionLoading[flag.id]).toBe(false))

    expect(mockApplyPenalty).not.toHaveBeenCalled()
  })

  it('releases the lock after a failed baseline so a safe retry can proceed', async () => {
    mockGetPenalties
      .mockRejectedValueOnce(new Error('baseline unavailable'))
      .mockResolvedValueOnce(makePenaltyResponse([]))
    mockApplyPenalty.mockResolvedValueOnce({ penalized_user_count: 2 })
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.actionLoading[flag.id]).toBe(false))
    expect(mockApplyPenalty).not.toHaveBeenCalled()

    confirmPenalty(result)
    await waitFor(() => expect(mockApplyPenalty).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.penaltyResults[flag.id]).toBe(2))
  })

  it('keeps retry suppressed when an old revoked row is joined by a new committed row', async () => {
    mockApplyPenalty.mockRejectedValueOnce(new Error('connection closed'))
    mockGetPenalties
      .mockResolvedValueOnce(makePenaltyResponse([oldRevokedPenalty]))
      .mockResolvedValueOnce(makePenaltyResponse([oldRevokedPenalty, committedPenalty]))
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.reconciliationRequired[flag.id]).toBe(false))
    confirmPenalty(result)

    expect(mockGetPenalties).toHaveBeenCalledWith({ sourceFlagId: flag.id })
    expect(mockApplyPenalty).toHaveBeenCalledOnce()
    expect(result.current.penaltyApplied[flag.id]).toBe(true)
  })

  it('fails closed when reconciliation returns a mismatched scope', async () => {
    mockApplyPenalty.mockRejectedValueOnce(new Error('connection closed'))
    mockGetPenalties
      .mockResolvedValueOnce(makePenaltyResponse([]))
      .mockResolvedValueOnce(makePenaltyResponse([], { source: 'flag', source_flag_id: 'flag-2' }))
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.reconciliationRequired[flag.id]).toBe(true))
    confirmPenalty(result)

    expect(mockApplyPenalty).toHaveBeenCalledOnce()
    expect(result.current.actionLoading[flag.id]).toBe(true)
  })

  it('keeps reconciliation GET-only until a manual retry succeeds', async () => {
    mockApplyPenalty.mockRejectedValueOnce(new Error('connection closed'))
    mockGetPenalties
      .mockResolvedValueOnce(makePenaltyResponse([]))
      .mockRejectedValueOnce(new Error('GET unavailable'))
      .mockResolvedValueOnce(makePenaltyResponse([committedPenalty]))
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.reconciliationRequired[flag.id]).toBe(true))
    expect(result.current.actionErrors[flag.id]).toBeTruthy()
    expect(result.current.actionLoading[flag.id]).toBe(true)
    confirmPenalty(result)
    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)

    await act(async () => result.current.retryReconciliation(flag.id))

    expect(mockGetFlag).toHaveBeenCalledTimes(2)
    expect(mockGetPenalties).toHaveBeenCalledTimes(3)
    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)
    expect(result.current.reconciliationRequired[flag.id]).toBe(false)
    expect(result.current.actionLoading[flag.id]).toBe(false)
  })

  it('records a confirmed penalty and does not submit it twice', async () => {
    mockApplyPenalty.mockResolvedValueOnce({ penalized_user_count: 3 })
    const { result } = renderVoteHook()

    confirmPenalty(result)
    await waitFor(() => expect(result.current.penaltyResults[flag.id]).toBe(3))
    confirmPenalty(result)

    expect(mockGetFlag).toHaveBeenCalledWith(flag.id)
    expect(mockApplyPenalty).toHaveBeenCalledTimes(1)
    expect(result.current.penaltyApplied[flag.id]).toBeUndefined()
  })
})
