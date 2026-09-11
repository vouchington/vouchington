import { createTransactionResource } from '../test-helpers/transaction-resource.mts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { beginTransaction } from '@voucha/test-helpers'
import {
  attachCheckoutToIdentityVerificationAttempt,
  releaseReservedIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../attempts.mts'
import {
  abandonIdentityVerificationProviderSession,
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
  releaseAttachedIdentityVerificationAttempt,
  releaseIdentityVerificationAttempt,
} from '../attempt-lifecycle.mts'

const mockBeginTransaction = vi.fn<typeof beginTransaction>()

function makeQueryResult(rows: Record<string, unknown>[] = []) {
  return { rowCount: rows.length, rows, command: 'SELECT', oid: 0, fields: [] }
}

function queryText(query: unknown): string {
  return (query as { text: string }).text
}

describe('reserveIdentityVerificationAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new zero-cost child attempt for a released support grant without rewriting the prior checkout audit', async () => {
    const query = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult([{ id: 'grant-1', source: 'support_grant' }]))
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await expect(
      reserveIdentityVerificationAttempt('user-1', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).resolves.toEqual({ id: 'grant-1', source: 'support_grant', amountMinorUnits: 0 })
    expect(query).toHaveBeenCalledTimes(2)
    const reservationSql = queryText(query.mock.calls[1]?.[0])
    expect(reservationSql).toContain('grant_entitlement_id')
    expect(reservationSql).toContain('NOT EXISTS')
    expect(reservationSql).toContain('ON CONFLICT (grant_entitlement_id)')
    expect(reservationSql).toContain('INSERT INTO identity_verification_attempts')
    expect(reservationSql).not.toContain('checkout_session_id = NULL')
  })

  it('releases only the child attempt while preserving its Checkout session identifier for audit', async () => {
    const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'attempt-2' }]))
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await releaseIdentityVerificationAttempt('cs_abandoned', {
      beginTransaction: mockBeginTransaction as never,
    })

    const releaseSql = queryText(query.mock.calls[0]?.[0])
    expect(releaseSql).toContain('SET released_at = CURRENT_TIMESTAMP')
    expect(releaseSql).toContain('checkout_session_id =')
    expect(releaseSql).toContain('checkout_claimed_at IS NULL')
    expect(releaseSql).not.toContain('checkout_session_id = NULL')
  })

  it('does not fall through to a paid attempt while a support-grant child is active', async () => {
    const query = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult([{ id: 'grant-parent' }]))
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await expect(
      reserveIdentityVerificationAttempt('user-1', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('consumes the child attempt once provider creation succeeds', async () => {
    const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'attempt-2' }]))
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await consumeIdentityVerificationAttempt('cs_retry', 'vs_retry', {
      beginTransaction: mockBeginTransaction as never,
    })

    const consumeSql = queryText(query.mock.calls[0]?.[0])
    expect(consumeSql).toContain('SET consumed_at = CURRENT_TIMESTAMP')
    expect(consumeSql).toContain('provider_session_id =')
  })

  it('reconciles an acknowledgement-lost Checkout attachment only for its exact active attempt', async () => {
    const query = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeQueryResult([{ id: 'attempt-1' }]))
    mockBeginTransaction
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockImplementationOnce(async () => createTransactionResource(query as never))

    await expect(
      attachCheckoutToIdentityVerificationAttempt('attempt-1', 'cs_test', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).resolves.toBeUndefined()
    const recoverySql = queryText(query.mock.calls[0]?.[0])
    expect(recoverySql).toContain('WHERE id =')
    expect(recoverySql).toContain('checkout_session_id =')
    expect(recoverySql).toContain('released_at IS NULL')
    expect(recoverySql).toContain('consumed_at IS NULL')
  })

  it.each(['a different Checkout', 'a released attempt', 'a consumed attempt'])(
    'rethrows an attachment error when recovery finds %s',
    async () => {
      const error = new Error('database unavailable')
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult())
      mockBeginTransaction
        .mockRejectedValueOnce(error)
        .mockImplementationOnce(async () => createTransactionResource(query as never))

      await expect(
        attachCheckoutToIdentityVerificationAttempt('attempt-1', 'cs_test', {
          beginTransaction: mockBeginTransaction as never,
        }),
      ).rejects.toBe(error)
    },
  )

  it('treats an already-active exact Checkout attachment as idempotent', async () => {
    const query = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult([{ id: 'attempt-1' }]))
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await expect(
      attachCheckoutToIdentityVerificationAttempt('attempt-1', 'cs_test', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects an additional paid attempt after a self-paid attempt was consumed', async () => {
    const query = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult([{ id: 'consumed-attempt' }]))
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await expect(
      reserveIdentityVerificationAttempt('user-1', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects when an included attempt cannot be reserved', async () => {
    const query = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeQueryResult([{ plan: 'plus' }]))
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult())
      .mockResolvedValueOnce(makeQueryResult())
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))

    await expect(
      reserveIdentityVerificationAttempt('user-1', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('handles lifecycle transitions and detects unavailable attempts', async () => {
    const withResults = (...results: ReturnType<typeof makeQueryResult>[]) => {
      const query = vi.fn<VitestLooseMock>()
      for (const result of results) query.mockResolvedValueOnce(result)
      mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))
      return query
    }

    withResults({ ...makeQueryResult(), rowCount: 1 })
    await beginIdentityVerificationProviderSession('cs_begin', {
      beginTransaction: mockBeginTransaction as never,
    })

    withResults(
      { ...makeQueryResult(), rowCount: 0 },
      makeQueryResult([{ provider_creation_started_at: new Date() }]),
    )
    await beginIdentityVerificationProviderSession('cs_existing', {
      beginTransaction: mockBeginTransaction as never,
    })

    withResults({ ...makeQueryResult(), rowCount: 0 }, makeQueryResult())
    await expect(
      beginIdentityVerificationProviderSession('cs_missing', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toMatchObject({ status: 409 })

    withResults({ ...makeQueryResult(), rowCount: 0 })
    await expect(
      releaseAttachedIdentityVerificationAttempt('attempt-1', 'cs_missing', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toMatchObject({ status: 409 })

    const abandonQuery = withResults(makeQueryResult())
    await abandonIdentityVerificationProviderSession('cs_abandon', {
      beginTransaction: mockBeginTransaction as never,
    })
    expect(queryText(abandonQuery.mock.calls[0]?.[0])).toContain(
      'provider_creation_started_at = NULL',
    )

    withResults(
      { ...makeQueryResult(), rowCount: 0 },
      makeQueryResult([{ provider_session_id: 'vs_existing' }]),
    )
    await consumeIdentityVerificationAttempt('cs_existing', 'vs_existing', {
      beginTransaction: mockBeginTransaction as never,
    })

    withResults({ ...makeQueryResult(), rowCount: 0 }, makeQueryResult())
    await expect(
      consumeIdentityVerificationAttempt('cs_missing', 'vs_new', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('releases detached reservations and rejects a multi-row checkout release', async () => {
    const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult())
    mockBeginTransaction.mockImplementation(async () => createTransactionResource(query as never))
    await releaseReservedIdentityVerificationAttempt('attempt-1', {
      beginTransaction: mockBeginTransaction as never,
    })

    const multiRowQuery = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ ...makeQueryResult(), rowCount: 2 })
    mockBeginTransaction.mockImplementation(async () =>
      createTransactionResource(multiRowQuery as never),
    )
    await expect(
      releaseIdentityVerificationAttempt('cs_duplicate', {
        beginTransaction: mockBeginTransaction as never,
      }),
    ).rejects.toThrow('multiple attempts')
  })
})
