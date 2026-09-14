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

  it('no-ops when user is not in identity_pending state for this session', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction.mockImplementationOnce(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(
        makeQueryResult([
          {
            verification_status: 'verified',
            pending_verification_session_id: null,
            pending_checkout_session_id: null,
          },
        ]),
      )
      return createTransactionResource(query as never)
    })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_test',
      metadata: { user_id: 'user-1' },
    })
    expect(mockGetVerificationResult).not.toHaveBeenCalled()
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('repairs post-commit vote side effects on a sequential event retry', async () => {
    mockBeginTransaction.mockReset()
    mockRecalculateVoteWeight.mockResolvedValue({ weight: 1.2, changed: true })
    mockEnqueueElectionUpdates.mockRejectedValueOnce(new Error('temporary queue outage'))
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_test'))
        return createTransactionResource(query as never)
      })
      .mockImplementation(async () => {
        const query = vi.fn<VitestLooseMock>()
        query
          .mockResolvedValueOnce(makeQueryResult([{ user_id: 'user-1' }])) // existing session → found
          .mockResolvedValue(makeQueryResult())
        return createTransactionResource(query as never)
      })

    await expect(
      onVerificationSessionVerifiedForTest('evt_1', {
        id: 'vs_test',
        metadata: { user_id: 'user-1' },
      }),
    ).rejects.toThrow('temporary queue outage')

    mockBeginTransaction.mockReset()
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(
        makeQueryResult([
          {
            verification_status: 'verified',
            pending_verification_session_id: null,
            pending_checkout_session_id: null,
            identity_committed: true,
          },
        ]),
      )
      return createTransactionResource(query as never)
    })
    mockEnqueueElectionUpdates.mockResolvedValue(undefined)

    await onVerificationSessionVerifiedForTest('evt_2', {
      id: 'vs_test',
      metadata: { user_id: 'user-1' },
    })
    expect(mockRecalculateVoteWeight).toHaveBeenCalledTimes(2)
    expect(mockEnqueueElectionUpdates).toHaveBeenCalledTimes(2)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
    expect(mockGetVerificationResult).toHaveBeenCalledTimes(1)
  })

  it.each(['failed', 'requires_input'] as const)(
    'transitions user to failed and invalidates when outcome is %s',
    async outcome => {
      mockGetVerificationResult.mockResolvedValue({ outcome })
      mockBeginTransaction.mockReset()
      mockBeginTransaction
        .mockImplementationOnce(async () => {
          const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_test'))
          return createTransactionResource(query as never)
        })
        .mockImplementationOnce(async () => {
          const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{}]))
          return createTransactionResource(query as never)
        })
      await onVerificationSessionVerifiedForTest('evt_1', {
        id: 'vs_test',
        metadata: { user_id: 'user-1' },
      })
      expect(mockBeginTransaction).toHaveBeenCalledTimes(2) // pre-guard + failed UPDATE
      expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
    },
  )

  it('no-ops when failed UPDATE matches 0 rows (user no longer identity_pending)', async () => {
    mockGetVerificationResult.mockResolvedValue({ outcome: 'failed' })
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makePreGuardResult('vs_test'))
        return createTransactionResource(query as never)
      })
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([])) // failed UPDATE → 0 rows
        return createTransactionResource(query as never)
      })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_test',
      metadata: { user_id: 'user-1' },
    })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('falls back to session-ID lookup when metadata.user_id is absent', async () => {
    // beginTransaction call order: (1) fallback user lookup, (2) pre-guard, (3) main transaction
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>()
        query.mockResolvedValue(
          makeQueryResult([{ id: 'user-1', pending_checkout_session_id: 'cs_fallback' }]),
        )
        return createTransactionResource(query as never)
      })
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>()
        query.mockResolvedValue(makePreGuardResult('vs_meta_absent'))
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
                pending_verification_session_id: 'vs_meta_absent',
              },
            ]),
          ) // guard
          .mockResolvedValueOnce(makeQueryResult([])) // collision → none
          .mockResolvedValueOnce(makeQueryResult([{ user_id: 'user-1' }])) // INSERT
          .mockResolvedValue(makeQueryResult([{ rowCount: 1 }])) // UPDATE
        return createTransactionResource(query as never)
      })
    await onVerificationSessionVerifiedForTest('evt_1', {
      id: 'vs_meta_absent',
      metadata: {},
    })
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('repairs committed side effects when a retry has redacted metadata', async () => {
    mockBeginTransaction.mockReset()
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi
          .fn<VitestLooseMock>()
          .mockResolvedValue(makeQueryResult([{ id: 'user-1', pending_checkout_session_id: null }]))
        return createTransactionResource(query as never)
      })
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(
          makeQueryResult([
            {
              verification_status: 'verified',
              pending_verification_session_id: null,
              pending_checkout_session_id: null,
              identity_committed: true,
            },
          ]),
        )
        return createTransactionResource(query as never)
      })

    await onVerificationSessionVerifiedForTest('evt_retry', { id: 'vs_redacted', metadata: {} })

    expect(mockGetVerificationResult).not.toHaveBeenCalled()
    expect(mockRecalculateVoteWeight).toHaveBeenCalledWith('user-1', { readFromWriter: true })
    expect(mockEnqueueElectionUpdates).toHaveBeenCalledWith('user-1')
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })
})
