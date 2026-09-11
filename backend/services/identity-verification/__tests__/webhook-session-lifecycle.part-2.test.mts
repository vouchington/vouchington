import { createTransactionResource } from '../test-helpers/transaction-resource.mts'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import type { beginTransaction } from '@voucha/test-helpers'
import { onCheckoutCompletedForIdentity as onCheckoutCompletedForIdentityProduction } from '../webhook-session-lifecycle.mts'

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

function onCheckoutCompletedForIdentity(
  ...args: Parameters<typeof onCheckoutCompletedForIdentityProduction>
) {
  const [eventId, eventData, dependencies] = args
  return onCheckoutCompletedForIdentityProduction(eventId, eventData, {
    beginTransaction: mockBeginTransaction as never,
    createVerificationSession: mockCreateVerificationSession as never,
    invalidateUsers: mockInvalidateUsers as never,
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
  const oldEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...oldEnv, PUBLIC_URL: 'https://example.com' }
    mockInvalidateUsers.mockResolvedValue(undefined)
    mockConsumeAttempt.mockResolvedValue(undefined)
    mockBeginProviderSession.mockResolvedValue(undefined)
    mockAbandonProviderSession.mockResolvedValue(undefined)
    mockReleaseAttempt.mockResolvedValue(undefined)
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
      return createTransactionResource(query as never)
    })
    mockCreateVerificationSession.mockResolvedValue({
      sessionId: 'vs_test',
      url: 'https://verify.stripe.com/vs_test',
    })
  })

  afterEach(() => {
    process.env = oldEnv
  })

  it('skips when payment_status is not paid or no_payment_required', async () => {
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'unpaid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('proceeds when payment_status is no_payment_required (zero-fee checkout)', async () => {
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'no_payment_required',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(3)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('skips when intent is not identity-verification', async () => {
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'other', user_id: 'user-1' },
      id: 'cs_test',
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when user_id is absent', async () => {
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification' },
      id: 'cs_test',
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when checkout session id is absent', async () => {
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('throws when PUBLIC_URL is not configured', async () => {
    delete process.env.PUBLIC_URL
    await expect(
      onCheckoutCompletedForIdentity('evt_1', {
        payment_status: 'paid',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        id: 'cs_test',
      }),
    ).rejects.toThrow('PUBLIC_URL')
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('returns early when pre-guard finds no matching user', async () => {
    mockBeginTransaction.mockImplementationOnce(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([]))
      return createTransactionResource(query as never)
    })
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })
    expect(mockCreateVerificationSession).not.toHaveBeenCalled()
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
  })

  it('does not create a provider session after the post-reservation state guard loses a race', async () => {
    mockBeginTransaction
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

    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })

    expect(mockBeginProviderSession).toHaveBeenCalledWith('cs_test')
    expect(mockCreateVerificationSession).not.toHaveBeenCalled()
    expect(mockAbandonProviderSession).toHaveBeenCalledWith('cs_test')
    expect(mockReleaseAttempt).toHaveBeenCalledWith('cs_test')
  })

  it('creates Stripe session with checkoutSessionId as idempotencyKey and atomically claims identity_pending', async () => {
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })
    expect(mockCreateVerificationSession).toHaveBeenCalledWith({
      userId: 'user-1',
      returnUrl: 'https://example.com/my/identity-verification',
      checkoutSessionId: 'cs_test',
      idempotencyKey: 'cs_test',
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(3)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('does not invalidate when claim-and-persist UPDATE is a no-op (concurrent event)', async () => {
    let callCount = 0
    mockBeginTransaction.mockImplementation(async () => {
      callCount++
      const result = callCount === 1 ? makeQueryResult([{ id: 'user-1' }]) : makeQueryResult([])
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(result)
      return createTransactionResource(query as never)
    })
    await onCheckoutCompletedForIdentity('evt_1', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('keeps the provider-creation fence after an ambiguous Stripe error so replay reconciles with the same idempotency key', async () => {
    mockCreateVerificationSession.mockRejectedValue(new Error('Stripe down'))
    await expect(
      onCheckoutCompletedForIdentity('evt_1', {
        payment_status: 'paid',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        id: 'cs_test',
      }),
    ).rejects.toThrow('Stripe down')
    expect(mockBeginTransaction).toHaveBeenCalledTimes(2)
    expect(mockAbandonProviderSession).not.toHaveBeenCalled()
    expect(mockConsumeAttempt).not.toHaveBeenCalled()
    expect(mockInvalidateUsers).not.toHaveBeenCalled()

    mockCreateVerificationSession.mockResolvedValue({
      sessionId: 'vs_test',
      url: 'https://verify.stripe.com/vs_test',
    })
    await onCheckoutCompletedForIdentity('evt_2', {
      payment_status: 'paid',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
      id: 'cs_test',
    })

    expect(mockBeginProviderSession).toHaveBeenCalledTimes(2)
    expect(mockCreateVerificationSession).toHaveBeenLastCalledWith({
      userId: 'user-1',
      returnUrl: 'https://example.com/my/identity-verification',
      checkoutSessionId: 'cs_test',
      idempotencyKey: 'cs_test',
    })
    expect(mockConsumeAttempt).toHaveBeenCalledWith('cs_test', 'vs_test')
  })
})
