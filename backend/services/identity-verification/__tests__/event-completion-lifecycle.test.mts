import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getIdentityVerificationAttemptStates,
  getUserVerificationState,
  insertTestVerifiedIdentity,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import {
  createIdentityPendingUser,
  observeUserCacheInvalidations,
} from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import { createPaymentPendingUser } from '@voucha/test-helpers/services/identity-verification/payment-pending-fixtures'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { v7 } from 'uuid'
import {
  onVerificationSessionRequiresInput,
  onVerificationSessionCanceled,
} from '../event-session-lifecycle.mts'
import { onCheckoutAbortedForIdentity } from '../event-session-terminal.mts'
import {
  attachCheckoutToIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../attempts.mts'

function makeFingerprint(): string {
  return v7().replaceAll('-', '').padEnd(64, '0')
}

describe('onVerificationSessionRequiresInput', () => {
  it('keeps user in identity_pending and invalidates cache (requires_input is recoverable)', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionRequiresInput('evt_1', {
      id: sessionId,
      metadata: { user_id: user.id },
    })

    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('finds the user by session id when Stripe cleared the metadata', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionRequiresInput('evt_1', { id: sessionId, metadata: {} })

    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('does nothing when the session id is absent or the user is not identity_pending', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const idle = await createTestUser()
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionRequiresInput('evt_1', { metadata: { user_id: user.id } })
    await onVerificationSessionRequiresInput('evt_2', {
      id: `vs_${v7()}`,
      metadata: { user_id: idle.id },
    })

    expect(invalidations.forUser(user.id)).toEqual([])
    expect(invalidations.forUser(idle.id)).toEqual([])
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })
    expect((await getUserVerificationState(idle.id))?.verification_status).toBe('unverified')
  })
})

describe('onVerificationSessionCanceled', () => {
  it('resets verification_status to unverified, clears verification_provider and pending session', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    await setUserVerificationFields(user.id, { verificationProvider: 'stripe_identity' })
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionCanceled('evt_1', {
      id: sessionId,
      metadata: { user_id: user.id },
    })

    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'unverified',
      verification_provider: null,
      pending_verification_session_id: null,
      pending_checkout_session_id: null,
    })
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('finds the user by session id when Stripe cleared the metadata', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionCanceled('evt_1', { id: sessionId, metadata: {} })

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('does nothing when the session id is absent or the user is not identity_pending', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const verified = await createTestUser()
    await insertTestVerifiedIdentity(verified.id, makeFingerprint(), `vs_${v7()}`)
    await setUserVerificationFields(verified.id, { verificationStatus: 'verified' })
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionCanceled('evt_1', { metadata: { user_id: user.id } })
    await onVerificationSessionCanceled('evt_2', {
      id: `vs_${v7()}`,
      metadata: { user_id: verified.id },
    })

    expect(invalidations.forUser(user.id)).toEqual([])
    expect(invalidations.forUser(verified.id)).toEqual([])
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })
    expect((await getUserVerificationState(verified.id))?.verification_status).toBe('verified')
  })
})

describe('onCheckoutAbortedForIdentity', () => {
  it('resets payment_pending to unverified, releases the attempt and invalidates the user', async () => {
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutAbortedForIdentity('evt_1', {
      id: checkoutSessionId,
      metadata: { intent: 'identity-verification', user_id: user.id },
    })

    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'unverified',
      verification_provider: null,
      pending_verification_session_id: null,
      pending_checkout_session_id: null,
    })
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, checkout_session_id: checkoutSessionId, released_at: expect.any(Date) },
    ])
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it.each([
    ['another intent', (userId: string) => ({ intent: 'other', user_id: userId })],
    ['no user id', () => ({ intent: 'identity-verification' })],
  ])('does nothing for %s', async (_label, makeMetadata) => {
    const { user, checkoutSessionId } = await createPaymentPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutAbortedForIdentity('evt_1', {
      id: checkoutSessionId,
      metadata: makeMetadata(user.id),
    })

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('does nothing when the checkout session id is absent', async () => {
    const { user } = await createPaymentPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutAbortedForIdentity('evt_1', {
      metadata: { intent: 'identity-verification', user_id: user.id },
    })

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('does nothing for a checkout that is not the pending one', async () => {
    const { user } = await createPaymentPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await onCheckoutAbortedForIdentity('evt_1', {
      id: `cs_${v7()}`,
      metadata: { intent: 'identity-verification', user_id: user.id },
    })

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
    expect(invalidations.forUser(user.id)).toEqual([])
  })

  it('commits nothing when the release statement is rejected, so a replay recovers', async () => {
    const { user, attemptId, checkoutSessionId } = await createPaymentPendingUser()
    const invalidations = observeUserCacheInvalidations()
    const eventData = {
      id: checkoutSessionId,
      metadata: { intent: 'identity-verification', user_id: user.id },
    }
    const restore = runBeforePostgresStatementForTest('onCheckoutAbortedForIdentity', async () => {
      throw new Error('release statement rejected')
    })

    try {
      await expect(onCheckoutAbortedForIdentity('evt_1', eventData)).rejects.toThrow(
        'release statement rejected',
      )
    } finally {
      restore()
    }

    expect(invalidations.forUser(user.id)).toEqual([])
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'payment_pending',
      pending_verification_session_id: checkoutSessionId,
    })
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, released_at: null },
    ])

    await onCheckoutAbortedForIdentity('evt_2', eventData)

    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'unverified',
      pending_verification_session_id: null,
      pending_checkout_session_id: null,
    })
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attemptId, released_at: expect.any(Date) },
    ])
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('leaves the user payment_pending while no attempt can be released, so a replay recovers', async () => {
    const user = await createTestUser()
    const checkoutSessionId = `cs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'payment_pending',
      verificationProvider: 'stripe_identity',
      pendingVerificationSessionId: checkoutSessionId,
    })
    const invalidations = observeUserCacheInvalidations()
    const eventData = {
      id: checkoutSessionId,
      metadata: { intent: 'identity-verification', user_id: user.id },
    }

    await onCheckoutAbortedForIdentity('evt_1', eventData)

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('payment_pending')
    expect(invalidations.forUser(user.id)).toEqual([])

    const attempt = await reserveIdentityVerificationAttempt(user.id)
    await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
    await onCheckoutAbortedForIdentity('evt_2', eventData)

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })
})
