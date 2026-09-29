import {
  makePreGuardResult,
  makeQueryResult,
  mockBeginTransaction,
  mockEnqueueElectionUpdates,
  mockFingerprint,
  mockGetVerificationResult,
  mockInvalidateUsers,
  mockRecalculateVoteWeight,
  onVerificationSessionVerifiedForTest,
  resetEventVerifiedDoubles,
} from '../../../test-helpers/services/identity-verification/event-verified-fixtures.mts'

import { createTransactionResource } from '../../../test-helpers/services/identity-verification/transaction-resource.mts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('onVerificationSessionVerified', () => {
  beforeEach(() => {
    resetEventVerifiedDoubles()
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
