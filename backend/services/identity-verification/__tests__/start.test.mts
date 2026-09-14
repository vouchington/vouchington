import { createTransactionResource } from '../../../test-helpers/services/identity-verification/transaction-resource.mts'
import { makePrivateUser } from '../../../test-helpers/services/identity-verification/start-test-fixtures.mts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { beginTransaction } from '@voucha/test-helpers'
import type { assertEligibleForIdentityVerification } from '../eligibility.mts'
import { startIdentityVerification, type StartIdentityVerificationDependencies } from '../start.mts'

const mockBeginTransaction = vi.fn<typeof beginTransaction>()
const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()
const mockAssertEligible = vi.fn<typeof assertEligibleForIdentityVerification>()
const mockCreateIdentityCheckoutSession =
  vi.fn<StartIdentityVerificationDependencies['createIdentityCheckoutSession']>()
const mockReserveAttempt = vi.fn<StartIdentityVerificationDependencies['reserveAttempt']>()
const mockAttachCheckout = vi.fn<StartIdentityVerificationDependencies['attachCheckoutToAttempt']>()
const mockReleaseAttempt = vi.fn<StartIdentityVerificationDependencies['releaseAttempt']>()
const mockReleaseAttachedAttempt =
  vi.fn<StartIdentityVerificationDependencies['releaseAttachedAttempt']>()
let mockQuery: ReturnType<typeof vi.fn<VitestLooseMock>>

function startIdentityVerificationForTest(
  currentUser: Parameters<typeof startIdentityVerification>[0],
  opts: Parameters<typeof startIdentityVerification>[1],
  dependencies: Partial<StartIdentityVerificationDependencies> = {},
) {
  return startIdentityVerification(currentUser, opts, {
    assertEligibleForIdentityVerification: mockAssertEligible,
    beginTransaction: mockBeginTransaction as never,
    invalidateUsers: mockInvalidateUsers as never,
    reserveAttempt: mockReserveAttempt,
    attachCheckoutToAttempt: mockAttachCheckout,
    releaseAttempt: mockReleaseAttempt,
    releaseAttachedAttempt: mockReleaseAttachedAttempt,
    ...dependencies,
    createIdentityCheckoutSession:
      dependencies.createIdentityCheckoutSession ?? mockCreateIdentityCheckoutSession,
  })
}

function queryText(query: unknown): string {
  return (query as { text: string }).text
}

function mockAmbiguousClaimRecovery({
  checkoutClaimedAt,
  pendingVerificationSessionId,
}: {
  checkoutClaimedAt: Date | null
  pendingVerificationSessionId: string | null
}) {
  mockQuery = vi.fn<VitestLooseMock>()
  mockBeginTransaction
    .mockRejectedValueOnce(new Error('database unavailable'))
    .mockImplementationOnce(async () =>
      createTransactionResource(
        mockQuery.mockResolvedValue({
          rows: [
            {
              checkout_claimed_at: checkoutClaimedAt,
              pending_verification_session_id: pendingVerificationSessionId,
            },
          ],
        }) as never,
      ),
    )
}

describe('startIdentityVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertEligible.mockResolvedValue(undefined)
    mockInvalidateUsers.mockResolvedValue(undefined)
    mockQuery = vi.fn<VitestLooseMock>().mockResolvedValue({ rows: [{ claim_committed: true }] })
    mockBeginTransaction.mockImplementation(async () =>
      createTransactionResource(mockQuery as never),
    )
    mockCreateIdentityCheckoutSession.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/pay/cs_test',
    } as never)
    mockReserveAttempt.mockResolvedValue({
      id: 'attempt-1',
      source: 'self_paid',
      amountMinorUnits: 500,
    })
    mockAttachCheckout.mockResolvedValue(undefined)
    mockReleaseAttempt.mockResolvedValue(undefined)
    mockReleaseAttachedAttempt.mockResolvedValue(undefined)
  })

  it('returns the checkout URL on success', async () => {
    const user = makePrivateUser()
    const result = await startIdentityVerificationForTest(user, {
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })
    expect(result.url).toBe('https://checkout.stripe.com/pay/cs_test')
    expect(mockCreateIdentityCheckoutSession).toHaveBeenCalledTimes(1)
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockAssertEligible).toHaveBeenCalledWith(user)
    expect(mockInvalidateUsers).toHaveBeenCalledWith(user.id)
    expect(queryText(mockQuery.mock.calls[0]![0])).toContain(
      'checkout_claimed_at = CURRENT_TIMESTAMP',
    )
  })

  it('continues to the Checkout URL after attachment recovery succeeds', async () => {
    await expect(
      startIdentityVerificationForTest(makePrivateUser(), {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' })
    expect(mockReleaseAttempt).not.toHaveBeenCalled()
  })

  it('includes intent and user_id in checkout session metadata', async () => {
    const user = makePrivateUser({ id: 'user-xyz' })
    await startIdentityVerificationForTest(user, {
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })
    expect(mockCreateIdentityCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          intent: 'identity-verification',
          user_id: 'user-xyz',
        }),
      }),
    )
  })

  it('creates a zero-dollar Checkout for a membership-included attempt', async () => {
    mockReserveAttempt.mockResolvedValue({
      id: 'attempt-included',
      source: 'membership_included',
      amountMinorUnits: 0,
    })
    await startIdentityVerificationForTest(makePrivateUser(), {
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })
    expect(mockCreateIdentityCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceAmountMinorUnits: 0 }),
    )
  })

  it('releases a reservation when Checkout creation fails', async () => {
    mockCreateIdentityCheckoutSession.mockRejectedValue(new Error('Stripe unavailable'))
    await expect(
      startIdentityVerificationForTest(makePrivateUser(), {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toThrow('Stripe unavailable')
    expect(mockReleaseAttempt).toHaveBeenCalledWith('attempt-1')
  })

  it('propagates errors from assertEligible without touching Stripe or DB', async () => {
    mockAssertEligible.mockRejectedValue(new Error('Suspended'))
    const user = makePrivateUser()
    await expect(
      startIdentityVerificationForTest(user, {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toThrow('Suspended')
    expect(mockCreateIdentityCheckoutSession).not.toHaveBeenCalled()
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('throws 409 when its attempt was not durably claimed', async () => {
    const mockQuery = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ rows: [{ claim_committed: false }] })
    mockBeginTransaction.mockImplementation(async () =>
      createTransactionResource(mockQuery as never),
    )
    const user = makePrivateUser()
    await expect(
      startIdentityVerificationForTest(user, {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
    expect(mockReleaseAttachedAttempt).toHaveBeenCalledWith('attempt-1', 'cs_test')
  })

  it('returns the just-created Checkout URL when an ambiguous committed claim has redacted metadata', async () => {
    mockAmbiguousClaimRecovery({
      checkoutClaimedAt: new Date(),
      pendingVerificationSessionId: null,
    })

    await expect(
      startIdentityVerificationForTest(makePrivateUser(), {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' })
    expect(mockReleaseAttachedAttempt).not.toHaveBeenCalled()
    expect(queryText(mockQuery.mock.calls[0]![0])).toContain('WHERE id = $1')
  })

  it('returns the just-created Checkout URL when another attempt replaced user session metadata', async () => {
    mockAmbiguousClaimRecovery({
      checkoutClaimedAt: new Date(),
      pendingVerificationSessionId: 'cs_winner',
    })

    await expect(
      startIdentityVerificationForTest(makePrivateUser(), {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' })
    expect(mockReleaseAttachedAttempt).not.toHaveBeenCalled()
  })

  it('releases the attached attempt when an overlapping claim committed for another session', async () => {
    mockAmbiguousClaimRecovery({
      checkoutClaimedAt: null,
      pendingVerificationSessionId: 'cs_winner',
    })

    await expect(
      startIdentityVerificationForTest(makePrivateUser(), {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toThrow('database unavailable')

    expect(mockReleaseAttachedAttempt).toHaveBeenCalledWith('attempt-1', 'cs_test')
  })

  it('throws if Stripe session has no URL (before DB update, no DB side effect)', async () => {
    mockCreateIdentityCheckoutSession.mockResolvedValue({
      id: 'cs_nurl',
      url: null,
    } as never)
    const user = makePrivateUser()
    await expect(
      startIdentityVerificationForTest(user, {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toThrow('missing URL')
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('rethrows Stripe errors without touching the DB', async () => {
    mockCreateIdentityCheckoutSession.mockRejectedValue(new Error('Stripe unavailable'))
    const user = makePrivateUser({ verification_status: 'failed' })
    await expect(
      startIdentityVerificationForTest(user, {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toThrow('Stripe unavailable')
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('still returns URL when cache invalidation fails (session already live)', async () => {
    mockInvalidateUsers.mockRejectedValue(new Error('cache down'))
    const user = makePrivateUser({ id: 'user-abc' })
    const result = await startIdentityVerificationForTest(user, {
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })
    expect(result.url).toBe('https://checkout.stripe.com/pay/cs_test')
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
  })
})
