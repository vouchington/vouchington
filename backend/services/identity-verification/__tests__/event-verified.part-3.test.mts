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

  it('no-ops and revokes verified_identities when final user UPDATE matches 0 rows', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_race2'))
        return createTransactionResource(query as never)
      })
      .mockImplementation(async () => {
        const query = vi.fn<VitestLooseMock>()
        query
          .mockResolvedValueOnce(makeQueryResult([])) // existing session → not found
          .mockResolvedValueOnce(
            makeQueryResult([
              {
                verification_status: 'identity_pending',
                pending_verification_session_id: 'vs_race2',
              },
            ]),
          ) // guard
          .mockResolvedValueOnce(makeQueryResult([])) // collision → none
          .mockResolvedValueOnce(makeQueryResult([{ user_id: 'user-1' }])) // INSERT succeeds
          .mockResolvedValueOnce(makeQueryResult([])) // UPDATE users → 0 rows (concurrent race)
          .mockResolvedValue(makeQueryResult()) // revoke verified_identities
        return createTransactionResource(query as never)
      })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_race2',
      metadata: { user_id: 'user-1' },
    })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })
})
