import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  getIdentityVerificationAttemptStates,
  getUserVerificationState,
} from '@voucha/test-helpers'
import {
  createIdentityPendingUser,
  makeVerifiedResult,
  observeUserCacheInvalidations,
  stubIdentityFingerprintSecret,
} from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import { createPaymentPendingUser } from '@voucha/test-helpers/services/identity-verification/payment-pending-fixtures'
import { createStripeEvent } from '@voucha/test-helpers/membership-stripe-fixtures'
import { stripeIdentityProvider } from '@services/identity-verification/stripe-identity'
import { handleStripeEvent } from './event-handlers.mts'

const applicationContext = { applicationId: `stripe-event-identity-${randomUUID()}` }

function productionEvent(type: string, object: Record<string, unknown>) {
  const event = createStripeEvent(type, object)
  event.livemode = true
  return event
}

describe('handleStripeEvent identity events', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['paid', 'no_payment_required'])(
    'starts identity verification for a %s identity-verification checkout',
    async paymentStatus => {
      vi.stubEnv('PUBLIC_URL', 'https://test.example.com')
      onTestFinished(() => {
        vi.unstubAllEnvs()
      })
      const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
      const providerSessionId = `vs_${randomUUID()}`
      const createVerificationSession = vi
        .spyOn(stripeIdentityProvider, 'createVerificationSession')
        .mockResolvedValue({
          sessionId: providerSessionId,
          url: `https://verify.stripe.com/${providerSessionId}`,
        })

      const result = await handleStripeEvent(
        productionEvent('checkout.session.completed', {
          id: checkoutSessionId,
          mode: 'payment',
          payment_status: paymentStatus,
          metadata: { intent: 'identity-verification', user_id: user.id },
        }),
        applicationContext,
      )

      expect(result).toBe('processed')
      expect(createVerificationSession).toHaveBeenCalledExactlyOnceWith({
        userId: user.id,
        returnUrl: 'https://test.example.com/my/identity-verification',
        checkoutSessionId,
        idempotencyKey: checkoutSessionId,
      })
      expect(await getUserVerificationState(user.id)).toMatchObject({
        verification_status: 'identity_pending',
        pending_verification_session_id: providerSessionId,
      })
      expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
        { id: attemptId, provider_session_id: providerSessionId },
      ])
    },
  )

  it('leaves an unpaid identity-verification checkout payment_pending', async () => {
    const { user, checkoutSessionId } = await createPaymentPendingUser()
    const createVerificationSession = vi.spyOn(stripeIdentityProvider, 'createVerificationSession')

    await handleStripeEvent(
      productionEvent('checkout.session.completed', {
        id: checkoutSessionId,
        mode: 'payment',
        payment_status: 'unpaid',
        metadata: { intent: 'identity-verification', user_id: user.id },
      }),
      applicationContext,
    )

    expect(createVerificationSession).not.toHaveBeenCalled()
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
  })

  it('releases an expired identity-verification checkout', async () => {
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()

    const result = await handleStripeEvent(
      productionEvent('checkout.session.expired', {
        id: checkoutSessionId,
        mode: 'payment',
        metadata: { intent: 'identity-verification', user_id: user.id },
      }),
      applicationContext,
    )

    expect(result).toBe('processed')
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, released_at: expect.any(Date) },
    ])
  })

  it('verifies the identity from identity.verification_session.verified', async () => {
    stubIdentityFingerprintSecret()
    const { user, sessionId } = await createIdentityPendingUser()
    vi.spyOn(stripeIdentityProvider, 'getVerificationResult').mockResolvedValue(
      makeVerifiedResult(),
    )

    const result = await handleStripeEvent(
      productionEvent('identity.verification_session.verified', {
        id: sessionId,
        metadata: { user_id: user.id },
      }),
      applicationContext,
    )

    expect(result).toBe('processed')
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'verified',
      pending_verification_session_id: null,
      verified_full_name: 'Alice Smith',
    })
  })

  it('keeps the user identity_pending on identity.verification_session.requires_input', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const invalidations = observeUserCacheInvalidations()

    const result = await handleStripeEvent(
      productionEvent('identity.verification_session.requires_input', {
        id: sessionId,
        metadata: { user_id: user.id },
      }),
      applicationContext,
    )

    expect(result).toBe('processed')
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it.each(['identity.verification_session.canceled', 'identity.verification_session.redacted'])(
    'resets the user to unverified on %s',
    async type => {
      const { user, sessionId } = await createIdentityPendingUser()

      const result = await handleStripeEvent(
        productionEvent(type, { id: sessionId, metadata: { user_id: user.id } }),
        applicationContext,
      )

      expect(result).toBe('processed')
      expect(await getUserVerificationState(user.id)).toMatchObject({
        verification_status: 'unverified',
        pending_verification_session_id: null,
      })
    },
  )
})
