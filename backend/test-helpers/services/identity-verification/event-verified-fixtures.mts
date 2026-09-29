import { createTransactionResource } from './transaction-resource.mts'
import { vi } from 'vitest'

import type { beginTransaction } from '@voucha/test-helpers'
import type { computeIdentityFingerprint } from '../../../services/identity-verification/fingerprint.mts'

import { onVerificationSessionVerified } from '../../../services/identity-verification/event-completion.mts'

type EventVerifiedDependencies = NonNullable<Parameters<typeof onVerificationSessionVerified>[2]>

const mockBeginTransaction = vi.fn<typeof beginTransaction>()

const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()

const mockGetVerificationResult =
  vi.fn<NonNullable<EventVerifiedDependencies['getVerificationResult']>>()

const mockFingerprint = vi.fn<typeof computeIdentityFingerprint>()
const mockRecalculateVoteWeight =
  vi.fn<(userId: string) => Promise<{ weight: number; changed: boolean }>>()
const mockEnqueueElectionUpdates = vi.fn<(userId: string) => Promise<string[]>>()

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

function makePreGuardResult(sessionId: string) {
  return makeQueryResult([
    {
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
      pending_checkout_session_id: 'cs_test',
    },
  ])
}

function resetEventVerifiedDoubles() {
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
  mockEnqueueElectionUpdates.mockResolvedValue([])
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
}

export {
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
}
