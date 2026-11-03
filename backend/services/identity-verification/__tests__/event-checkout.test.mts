import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  getIdentityVerificationAttemptStates,
  getUserVerificationState,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { observeUserCacheInvalidations } from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import { createPaymentPendingUser } from '@voucha/test-helpers/services/identity-verification/payment-pending-fixtures'
import { v7 } from 'uuid'
import { onCheckoutCompletedForIdentity } from '../event-session-lifecycle.mts'

type CreateVerificationSession = Required<
  NonNullable<Parameters<typeof onCheckoutCompletedForIdentity>[2]>
>['createVerificationSession']

const PUBLIC_URL = 'https://test.example.com'

function makeCheckout() {
  const providerSessionId = `vs_${v7()}`
  const createVerificationSession = vi.fn<CreateVerificationSession>(async () => ({
    sessionId: providerSessionId,
    url: `https://verify.stripe.com/${providerSessionId}`,
  }))
  return { providerSessionId, createVerificationSession }
}

function completed(
  checkoutSessionId: string | undefined,
  userId: string | undefined,
  paymentStatus = 'paid',
  intent = 'identity-verification',
) {
  return {
    id: checkoutSessionId,
    payment_status: paymentStatus,
    metadata: { intent, ...(userId ? { user_id: userId } : {}) },
  }
}

function stubPublicUrl(value = PUBLIC_URL) {
  vi.stubEnv('PUBLIC_URL', value)
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
}

describe('onCheckoutCompletedForIdentity', () => {
  it.each(['paid', 'no_payment_required'])(
    'creates the Stripe session with the checkout as idempotency key and claims identity_pending on %s',
    async paymentStatus => {
      stubPublicUrl()
      const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
      const { providerSessionId, createVerificationSession } = makeCheckout()
      const invalidations = observeUserCacheInvalidations()

      await onCheckoutCompletedForIdentity(
        'evt_1',
        completed(checkoutSessionId, user.id, paymentStatus),
        { createVerificationSession },
      )

      expect(createVerificationSession).toHaveBeenCalledExactlyOnceWith({
        userId: user.id,
        returnUrl: 'https://test.example.com/my/identity-verification',
        checkoutSessionId,
        idempotencyKey: checkoutSessionId,
      })
      expect(await getUserVerificationState(user.id)).toMatchObject({
        verification_status: 'identity_pending',
        pending_checkout_session_id: checkoutSessionId,
        pending_verification_session_id: providerSessionId,
      })
      expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
        {
          id: attemptId,
          provider_session_id: providerSessionId,
          provider_creation_started_at: expect.any(Date),
          consumed_at: expect.any(Date),
          released_at: null,
        },
      ])
      expect(invalidations.forUser(user.id)).toEqual([[user.id]])
    },
  )

  it.each([
    ['payment is unpaid', (cs: string, id: string) => completed(cs, id, 'unpaid')],
    ['the intent is another', (cs: string, id: string) => completed(cs, id, 'paid', 'other')],
    ['user_id is absent', (cs: string) => completed(cs, undefined)],
    ['the checkout id is absent', (_cs: string, id: string) => completed(undefined, id)],
  ])('does nothing when %s', async (_label, makeEvent) => {
    stubPublicUrl()
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
    const { createVerificationSession } = makeCheckout()

    await onCheckoutCompletedForIdentity('evt_1', makeEvent(checkoutSessionId, user.id), {
      createVerificationSession,
    })

    expect(createVerificationSession).not.toHaveBeenCalled()
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, provider_creation_started_at: null, consumed_at: null },
    ])
  })

  it('throws when PUBLIC_URL is not configured', async () => {
    stubPublicUrl('')
    const { user, checkoutSessionId } = await createPaymentPendingUser()
    const { createVerificationSession } = makeCheckout()

    await expect(
      onCheckoutCompletedForIdentity('evt_1', completed(checkoutSessionId, user.id), {
        createVerificationSession,
      }),
    ).rejects.toThrow('PUBLIC_URL')
    expect(createVerificationSession).not.toHaveBeenCalled()
  })

  it('does not call Stripe when the user is no longer payment_pending for this checkout', async () => {
    stubPublicUrl()
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
    await setUserVerificationFields(user.id, {
      verificationStatus: 'unverified',
      pendingVerificationSessionId: null,
    })
    const { createVerificationSession } = makeCheckout()
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutCompletedForIdentity('evt_1', completed(checkoutSessionId, user.id), {
      createVerificationSession,
    })

    expect(createVerificationSession).not.toHaveBeenCalled()
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, provider_creation_started_at: null },
    ])
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('does not create a provider session after the post-reservation state guard loses a race', async () => {
    stubPublicUrl()
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
    const { createVerificationSession } = makeCheckout()
    onTestFinished(
      runBeforePostgresStatementForTest(
        'onCheckoutCompletedForIdentity:post-reservation-guard',
        async () => {
          await setUserVerificationFields(user.id, {
            verificationStatus: 'unverified',
            pendingVerificationSessionId: null,
          })
        },
      ),
    )
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutCompletedForIdentity('evt_1', completed(checkoutSessionId, user.id), {
      createVerificationSession,
    })

    expect(createVerificationSession).not.toHaveBeenCalled()
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      {
        id: attemptId,
        provider_creation_started_at: null,
        consumed_at: null,
        released_at: expect.any(Date),
      },
    ])
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('does not invalidate when a concurrent event already claimed the user', async () => {
    stubPublicUrl()
    const { user, checkoutSessionId } = await createPaymentPendingUser()
    const { createVerificationSession } = makeCheckout()
    onTestFinished(
      runBeforePostgresStatementForTest(
        'onCheckoutCompletedForIdentity:claim-and-persist',
        async () => {
          await setUserVerificationFields(user.id, {
            verificationStatus: 'identity_pending',
            pendingVerificationSessionId: 'vs_winner',
            pendingCheckoutSessionId: checkoutSessionId,
          })
        },
      ),
    )
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutCompletedForIdentity('evt_1', completed(checkoutSessionId, user.id), {
      createVerificationSession,
    })

    expect(createVerificationSession).toHaveBeenCalledOnce()
    expect((await getUserVerificationState(user.id))?.pending_verification_session_id).toBe(
      'vs_winner',
    )
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('keeps the provider-creation fence after an ambiguous Stripe error so replay reconciles with the same idempotency key', async () => {
    stubPublicUrl()
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
    const failing = vi.fn<CreateVerificationSession>(async () => {
      throw new Error('Stripe down')
    })
    const invalidations = observeUserCacheInvalidations()

    await expect(
      onCheckoutCompletedForIdentity('evt_1', completed(checkoutSessionId, user.id), {
        createVerificationSession: failing,
      }),
    ).rejects.toThrow('Stripe down')

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      {
        id: attemptId,
        provider_creation_started_at: expect.any(Date),
        consumed_at: null,
        provider_session_id: null,
      },
    ])
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
    expect(invalidations.forUser(user.id)).toEqual([])

    const { providerSessionId, createVerificationSession } = makeCheckout()
    await onCheckoutCompletedForIdentity('evt_2', completed(checkoutSessionId, user.id), {
      createVerificationSession,
    })

    expect(createVerificationSession).toHaveBeenCalledExactlyOnceWith({
      userId: user.id,
      returnUrl: 'https://test.example.com/my/identity-verification',
      checkoutSessionId,
      idempotencyKey: checkoutSessionId,
    })
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, provider_session_id: providerSessionId, consumed_at: expect.any(Date) },
    ])
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('identity_pending')
  })
})
