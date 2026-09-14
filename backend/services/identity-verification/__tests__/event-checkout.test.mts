import { createTransactionResource } from '../../../test-helpers/services/identity-verification/transaction-resource.mts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { beginTransaction } from '@voucha/test-helpers'
import { onCheckoutCompletedForIdentity as onCheckoutCompletedForIdentityProduction } from '../event-session-lifecycle.mts'

type CreateVerificationSessionInput = {
  checkoutSessionId: string
  idempotencyKey: string
  returnUrl: string
  userId: string
}

type CreateVerificationSessionResult = {
  sessionId: string
  url: string | null
}

const mockBeginTransaction = vi.fn<typeof beginTransaction>()
const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()
const mockCreateVerificationSession =
  vi.fn<(input: CreateVerificationSessionInput) => Promise<CreateVerificationSessionResult>>()
const mockConsumeAttempt =
  vi.fn<(checkoutSessionId: string, providerSessionId: string) => Promise<void>>()
const mockBeginProviderSession = vi.fn<(checkoutSessionId: string) => Promise<void>>()
const mockAbandonProviderSession = vi.fn<(checkoutSessionId: string) => Promise<void>>()
const mockReleaseAttempt = vi.fn<(checkoutSessionId: string) => Promise<void>>()

function onCheckoutCompletedForIdentityForTest(
  ...args: Parameters<typeof onCheckoutCompletedForIdentityProduction>
) {
  const [eventId, eventData, dependencies] = args
  return onCheckoutCompletedForIdentityProduction(eventId, eventData, {
    createVerificationSession: mockCreateVerificationSession as never,
    invalidateUsers: mockInvalidateUsers as never,
    beginTransaction: mockBeginTransaction as never,
    consumeAttempt: mockConsumeAttempt,
    beginProviderSession: mockBeginProviderSession,
    abandonProviderSession: mockAbandonProviderSession,
    releaseAttempt: mockReleaseAttempt,
    ...dependencies,
  })
}

function makeQueryResult(rows: Record<string, unknown>[] = []) {
  return { rowCount: rows.length, rows, command: 'SELECT', oid: 0, fields: [] }
}

describe('onCheckoutCompletedForIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('PUBLIC_URL', 'https://test.example.com')
    mockInvalidateUsers.mockResolvedValue(undefined)
    mockCreateVerificationSession.mockResolvedValue({
      sessionId: 'vs_test',
      url: 'https://verify.stripe.com/vs_test',
    })
    mockConsumeAttempt.mockResolvedValue(undefined)
    mockBeginProviderSession.mockResolvedValue(undefined)
    mockAbandonProviderSession.mockResolvedValue(undefined)
    mockReleaseAttempt.mockResolvedValue(undefined)
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
      return createTransactionResource(query as never)
    })
  })

  it('skips when payment_status is not paid', async () => {
    await runCheckout({
      eventData: {
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        payment_status: 'unpaid',
      },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when metadata intent is not identity-verification', async () => {
    await runCheckout({
      eventData: {
        metadata: { intent: 'other' },
        payment_status: 'paid',
      },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when user_id is absent', async () => {
    await runCheckout({
      eventData: {
        metadata: { intent: 'identity-verification' },
        payment_status: 'paid',
      },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when checkout session id is absent', async () => {
    await runCheckout({
      eventData: {
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        payment_status: 'paid',
      },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('does not call Stripe when pre-guard returns 0 rows (user not in payment_pending)', async () => {
    mockBeginTransaction.mockImplementationOnce(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([]))
      return createTransactionResource(query as never)
    })
    await runCheckout({
      eventData: {
        id: 'cs_abc',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        payment_status: 'paid',
      },
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockCreateVerificationSession).not.toHaveBeenCalled()
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('does not invalidate when claim-and-persist UPDATE returns 0 rows (concurrent event)', async () => {
    mockBeginTransaction
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>()
        query.mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
        return createTransactionResource(query as never)
      })
      .mockImplementationOnce(async () => {
        const query = vi
          .fn<VitestLooseMock>()
          .mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
        return createTransactionResource(query as never)
      })
      .mockImplementationOnce(async () => {
        const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([]))
        return createTransactionResource(query as never)
      })
    await runCheckout({
      eventData: {
        id: 'cs_abc',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        payment_status: 'paid',
      },
    })
    expect(mockCreateVerificationSession).toHaveBeenCalled()
    expect(mockBeginTransaction).toHaveBeenCalledTimes(3)
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('rethrows Stripe errors without modifying DB state', async () => {
    mockBeginTransaction.mockImplementationOnce(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
      return createTransactionResource(query as never)
    })
    mockCreateVerificationSession.mockRejectedValue(new Error('Stripe error'))
    await expect(
      runCheckout({
        eventData: {
          id: 'cs_abc',
          metadata: { intent: 'identity-verification', user_id: 'user-1' },
          payment_status: 'paid',
        },
      }),
    ).rejects.toThrow('Stripe error')
    expect(mockBeginTransaction).toHaveBeenCalledTimes(2)
    expect(mockAbandonProviderSession).not.toHaveBeenCalled()
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('creates a verification session with checkoutSessionId as idempotencyKey and invalidates on success', async () => {
    await runCheckout({
      eventData: {
        id: 'cs_abc',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        payment_status: 'paid',
      },
    })
    expect(mockCreateVerificationSession).toHaveBeenCalledWith({
      userId: 'user-1',
      returnUrl: 'https://test.example.com/my/identity-verification',
      checkoutSessionId: 'cs_abc',
      idempotencyKey: 'cs_abc',
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(3)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })
})

async function runCheckout(options: { eventData: Record<string, unknown> }): Promise<void> {
  await onCheckoutCompletedForIdentityForTest('evt_1', options.eventData, {
    createVerificationSession: mockCreateVerificationSession as never,
    invalidateUsers: mockInvalidateUsers as never,
    beginTransaction: mockBeginTransaction as never,
  })
}
