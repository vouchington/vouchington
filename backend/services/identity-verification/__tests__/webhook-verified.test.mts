import { createTransactionResource } from '../test-helpers/transaction-resource.mts'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { beginTransaction } from '@voucha/test-helpers'
import type { stripeIdentityProvider } from '@modules/stripe/identity'
import type { computeIdentityFingerprint } from '../fingerprint.mts'

import { onVerificationSessionVerified } from '../webhook-completion.mts'

const mockBeginTransaction = vi.fn<typeof beginTransaction>()

const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()

const mockGetVerificationResult = vi.fn<typeof stripeIdentityProvider.getVerificationResult>()

const mockFingerprint = vi.fn<typeof computeIdentityFingerprint>()
const mockRecalculateVoteWeight =
  vi.fn<(userId: string) => Promise<{ weight: number; changed: boolean }>>()
const mockEnqueueElectionUpdates = vi.fn<(userId: string) => Promise<void>>()

function onVerificationSessionVerifiedForTest(
  ...args: Parameters<typeof onVerificationSessionVerified>
) {
  const [eventId, eventData, dependencies] = args
  return onVerificationSessionVerified(eventId, eventData, {
    beginTransaction: mockBeginTransaction as never,
    getVerificationResult: mockGetVerificationResult,
    computeIdentityFingerprint: mockFingerprint,
    invalidateUsers: mockInvalidateUsers as never,
    recalculateUserVoteWeight: mockRecalculateVoteWeight,
    enqueueElectionUpdatesForUser: mockEnqueueElectionUpdates,
    ...dependencies,
  })
}

function makeQueryResult(rows: Record<string, unknown>[] = []) {
  return { rowCount: rows.length, rows, command: 'SELECT', oid: 0, fields: [] }
}

describe('onVerificationSessionVerified', () => {
  function makePreGuardResult(sessionId: string) {
    return makeQueryResult([
      {
        verification_status: 'identity_pending',
        pending_verification_session_id: sessionId,
        pending_checkout_session_id: 'cs_test',
      },
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerificationResult.mockResolvedValue({
      outcome: 'verified',
      firstName: 'Alice',
      lastName: 'Smith',
      fullName: 'Alice Smith',
      documentNumber: 'X1234',
      issuingCountry: 'US',
      documentType: 'passport',
    })
    mockFingerprint.mockReturnValue('a'.repeat(64))
    mockInvalidateUsers.mockResolvedValue(undefined)
    mockRecalculateVoteWeight.mockResolvedValue({ weight: 1, changed: false })
    mockEnqueueElectionUpdates.mockResolvedValue(undefined)
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_test'))
        return createTransactionResource(query as never)
      })
      .mockImplementation(async () => {
        const query = vi.fn<VitestLooseMock>()
        query
          .mockResolvedValueOnce(makeQueryResult([])) // existing session check → not found
          .mockResolvedValueOnce(
            makeQueryResult([
              {
                verification_status: 'identity_pending',
                pending_verification_session_id: 'vs_test',
              },
            ]),
          ) // guard check → identity_pending
          .mockResolvedValueOnce(makeQueryResult([])) // collision check → no collision
          .mockResolvedValueOnce(makeQueryResult([{ user_id: 'user-1' }])) // INSERT RETURNING row
          .mockResolvedValue(makeQueryResult([{}])) // UPDATE users → 1 row updated
        return createTransactionResource(query as never)
      })
  })

  it('skips when sessionId is absent', async () => {
    await onVerificationSessionVerifiedForTest('evt_1', { metadata: { user_id: 'user-1' } })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('falls back to session-ID lookup when metadata.user_id is absent, then no-ops when not found', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction.mockImplementationOnce(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([])) // fallback → no user found
      return createTransactionResource(query as never)
    })
    await onVerificationSessionVerifiedForTest('evt_1', { id: 'vs_test', metadata: {} })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockGetVerificationResult).not.toHaveBeenCalled()
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('computes fingerprint and inserts verified identity on success', async () => {
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_test',
      metadata: { user_id: 'user-1', checkout_session_id: 'cs_abc' },
    })
    expect(mockFingerprint).toHaveBeenCalledWith({
      issuingCountry: 'US',
      documentType: 'passport',
      documentNumber: 'X1234',
    })
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
    expect(mockRecalculateVoteWeight).toHaveBeenCalledWith('user-1', { readFromWriter: true })
  })

  it('sets duplicate_id when INSERT returns 0 rows due to concurrent fingerprint conflict', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_race'))
        return createTransactionResource(query as never)
      })
      .mockImplementation(async () => {
        const query = vi.fn<VitestLooseMock>()
        query
          .mockResolvedValueOnce(makeQueryResult([])) // existing session check → not found
          .mockResolvedValueOnce(
            makeQueryResult([
              {
                verification_status: 'identity_pending',
                pending_verification_session_id: 'vs_race',
              },
            ]),
          ) // guard check
          .mockResolvedValueOnce(makeQueryResult([])) // collision check → no collision (race window)
          .mockResolvedValueOnce(makeQueryResult([])) // INSERT ON CONFLICT DO NOTHING → 0 rows
          .mockResolvedValueOnce(makeQueryResult([])) // own-session check → different session (true duplicate)
          .mockResolvedValue(makeQueryResult()) // UPDATE to duplicate_id
        return createTransactionResource(query as never)
      })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_race',
      metadata: { user_id: 'user-1' },
    })
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('treats concurrent re-delivery of the same session as verified (not duplicate_id)', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>()
        query.mockResolvedValue(makePreGuardResult('vs_concurrent'))
        return createTransactionResource(query as never)
      })
      .mockImplementation(async () => {
        const query = vi.fn<VitestLooseMock>()
        query
          .mockResolvedValueOnce(makeQueryResult([])) // existing session check → not found (lost the race)
          .mockResolvedValueOnce(
            makeQueryResult([
              {
                verification_status: 'identity_pending',
                pending_verification_session_id: 'vs_concurrent',
              },
            ]),
          ) // guard check
          .mockResolvedValueOnce(makeQueryResult([])) // collision check → no collision
          .mockResolvedValueOnce(makeQueryResult([])) // INSERT ON CONFLICT DO NOTHING → 0 rows
          .mockResolvedValueOnce(makeQueryResult([{ user_id: 'user-1' }])) // own-session check → same session won
          .mockResolvedValue(makeQueryResult())
        return createTransactionResource(query as never)
      })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_concurrent',
      metadata: { user_id: 'user-1' },
    })
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('sets duplicate_id status when the fingerprint is active on another account (pre-check path)', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_dup'))
        return createTransactionResource(query as never)
      })
      .mockImplementation(async () => {
        const query = vi.fn<VitestLooseMock>()
        query
          .mockResolvedValueOnce(makeQueryResult([])) // existing session check → not found
          .mockResolvedValueOnce(
            makeQueryResult([
              {
                verification_status: 'identity_pending',
                pending_verification_session_id: 'vs_dup',
              },
            ]),
          ) // guard check → user is identity_pending for this session
          .mockResolvedValueOnce(makeQueryResult([{ user_id: 'other-user' }])) // collision found
          .mockResolvedValue(makeQueryResult()) // update to duplicate_id
        return createTransactionResource(query as never)
      })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_dup',
      metadata: { user_id: 'user-1' },
    })
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })
})
