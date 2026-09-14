import { createTransactionResource } from '../../../test-helpers/services/identity-verification/transaction-resource.mts'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { beginTransaction } from '@voucha/test-helpers'
import type { stripeIdentityProvider } from '@modules/stripe/identity'
import type { computeIdentityFingerprint } from '../fingerprint.mts'

import { onVerificationSessionVerified } from '../event-completion.mts'

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
