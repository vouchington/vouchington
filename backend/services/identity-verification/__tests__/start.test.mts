import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  getIdentityVerificationAttemptStates,
  getUserVerificationState,
  markIdentityVerificationAttemptCheckoutClaimed,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { observeUserCacheInvalidations } from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import {
  IDENTITY_VERIFICATION_CURRENCY,
  IDENTITY_VERIFICATION_FEE_MINOR_UNITS,
} from '@voucha/config'
import { v7 } from 'uuid'
import { startIdentityVerification } from '../start.mts'

type CreateIdentityCheckoutSession = Parameters<
  typeof startIdentityVerification
>[2]['createIdentityCheckoutSession']

const opts = { successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' }

function makeCheckout(url: string | null = 'https://checkout.stripe.com/pay/cs_test') {
  const checkoutId = `cs_${v7()}`
  const createIdentityCheckoutSession = vi.fn<CreateIdentityCheckoutSession>(
    async () => ({ id: checkoutId, url }) as never,
  )
  return { checkoutId, createIdentityCheckoutSession }
}

describe('startIdentityVerification', () => {
  it('claims payment_pending for the exact attempt and returns the checkout URL', async () => {
    const user = await createTestUser()
    const { checkoutId, createIdentityCheckoutSession } = makeCheckout()
    const invalidations = observeUserCacheInvalidations()

    const result = await startIdentityVerification(user, opts, { createIdentityCheckoutSession })

    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' })
    const [attempt] = await getIdentityVerificationAttemptStates(user.id)
    expect(attempt).toMatchObject({
      source: 'self_paid',
      checkout_session_id: checkoutId,
      checkout_claimed_at: expect.any(Date),
      released_at: null,
    })
    expect(createIdentityCheckoutSession).toHaveBeenCalledExactlyOnceWith({
      userId: user.id,
      email: user.email_address,
      priceAmountMinorUnits: IDENTITY_VERIFICATION_FEE_MINOR_UNITS,
      currency: IDENTITY_VERIFICATION_CURRENCY,
      productName: 'Identity Verification',
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
      metadata: {
        intent: 'identity-verification',
        user_id: user.id,
        identity_verification_attempt_id: attempt!.id,
      },
    })
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'payment_pending',
      verification_provider: 'stripe_identity',
      pending_verification_session_id: checkoutId,
      pending_checkout_session_id: null,
    })
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('creates a zero-dollar Checkout for a membership-included attempt', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus', status: 'active' })
    const { createIdentityCheckoutSession } = makeCheckout()

    await startIdentityVerification(user, opts, { createIdentityCheckoutSession })

    expect(createIdentityCheckoutSession).toHaveBeenCalledOnce()
    expect(createIdentityCheckoutSession.mock.calls[0]![0]).toMatchObject({
      priceAmountMinorUnits: 0,
    })
  })

  it('still returns the URL when cache invalidation fails (session already live)', async () => {
    const user = await createTestUser()
    const { createIdentityCheckoutSession } = makeCheckout()
    const invalidations = observeUserCacheInvalidations()
    invalidations.spy.mockRejectedValueOnce(new Error('cache down'))

    await expect(
      startIdentityVerification(user, opts, { createIdentityCheckoutSession }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' })

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
  })

  it('propagates an eligibility error without touching Stripe or an attempt', async () => {
    const user = await createTestUser()
    await setUserVerificationFields(user.id, { verificationStatus: 'verified' })
    const verified = { ...user, verification_status: 'verified' as const }
    const { createIdentityCheckoutSession } = makeCheckout()

    await expect(
      startIdentityVerification(verified, opts, { createIdentityCheckoutSession }),
    ).rejects.toMatchObject({ status: 409, message: 'Your account is already verified.' })

    expect(createIdentityCheckoutSession).not.toHaveBeenCalled()
    expect(await getIdentityVerificationAttemptStates(user.id)).toEqual([])
  })

  it('releases the reservation and leaves the user unchanged when Checkout creation fails', async () => {
    const user = await createTestUser()
    const createIdentityCheckoutSession = vi.fn<CreateIdentityCheckoutSession>(async () => {
      throw new Error('Stripe unavailable')
    })

    await expect(
      startIdentityVerification(user, opts, { createIdentityCheckoutSession }),
    ).rejects.toThrow('Stripe unavailable')

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { checkout_session_id: null, released_at: expect.any(Date) },
    ])
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
  })

  it('releases the reservation when the Stripe session has no URL', async () => {
    const user = await createTestUser()
    const { createIdentityCheckoutSession } = makeCheckout(null)

    await expect(
      startIdentityVerification(user, opts, { createIdentityCheckoutSession }),
    ).rejects.toThrow('missing URL')

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { checkout_session_id: null, released_at: expect.any(Date) },
    ])
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
  })

  it('throws 409 and releases the attached attempt when its claim was not durably made', async () => {
    const user = await createTestUser()
    const { checkoutId, createIdentityCheckoutSession } = makeCheckout()
    onTestFinished(
      runBeforePostgresStatementForTest('startIdentityVerification:claim-and-persist', async () => {
        await setUserVerificationFields(user.id, { verificationStatus: 'identity_pending' })
      }),
    )
    const invalidations = observeUserCacheInvalidations()

    await expect(
      startIdentityVerification(user, opts, { createIdentityCheckoutSession }),
    ).rejects.toMatchObject({ status: 409 })

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      {
        checkout_session_id: checkoutId,
        checkout_claimed_at: null,
        released_at: expect.any(Date),
      },
    ])
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('identity_pending')
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('returns the just-created Checkout URL when an ambiguous claim failure had committed', async () => {
    const user = await createTestUser()
    const { checkoutId, createIdentityCheckoutSession } = makeCheckout()
    onTestFinished(
      runBeforePostgresStatementForTest('startIdentityVerification:claim-and-persist', async () => {
        await markIdentityVerificationAttemptCheckoutClaimed(checkoutId)
        throw new Error('acknowledgement lost')
      }),
    )
    const invalidations = observeUserCacheInvalidations()

    await expect(
      startIdentityVerification(user, opts, { createIdentityCheckoutSession }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' })

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { checkout_session_id: checkoutId, checkout_claimed_at: expect.any(Date), released_at: null },
    ])
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('releases the attached attempt and rethrows when an ambiguous claim failure had not committed', async () => {
    const user = await createTestUser()
    const { checkoutId, createIdentityCheckoutSession } = makeCheckout()
    onTestFinished(
      runBeforePostgresStatementForTest('startIdentityVerification:claim-and-persist', async () => {
        throw new Error('database unavailable')
      }),
    )
    const invalidations = observeUserCacheInvalidations()

    await expect(
      startIdentityVerification(user, opts, { createIdentityCheckoutSession }),
    ).rejects.toThrow('database unavailable')

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      {
        checkout_session_id: checkoutId,
        checkout_claimed_at: null,
        released_at: expect.any(Date),
      },
    ])
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
    expect(invalidations.forUser(user.id)).toEqual([])
  })
})
