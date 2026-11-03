import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  getIdentityVerificationAttemptStates,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { rejectNextPostgresTransactionForTest } from '@voucha/test-helpers/injected-failures'
import { IDENTITY_VERIFICATION_FEE_MINOR_UNITS } from '@voucha/config'
import { v7 } from 'uuid'
import {
  attachCheckoutToIdentityVerificationAttempt,
  releaseReservedIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../attempts.mts'
import { grantIdentityVerificationAttempt } from '../attempt-grants.mts'
import {
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
  releaseIdentityVerificationAttempt,
} from '../attempt-lifecycle.mts'

async function reserveAttachedAttempt(userId: string) {
  const attempt = await reserveIdentityVerificationAttempt(userId)
  const checkoutSessionId = `cs_${v7()}`
  await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
  return { attempt, checkoutSessionId }
}

async function consumeSelfPaidAttempt(userId: string) {
  const { checkoutSessionId } = await reserveAttachedAttempt(userId)
  await beginIdentityVerificationProviderSession(checkoutSessionId)
  await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`)
  await setUserVerificationFields(userId, { verificationStatus: 'failed' })
}

async function createUserWithSupportGrant() {
  const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])
  await consumeSelfPaidAttempt(user.id)
  await grantIdentityVerificationAttempt(user.id, supportAgent.id, `test grant ${v7()}`)
  return user
}

describe('reserveIdentityVerificationAttempt', () => {
  it('charges the identity verification fee for a user without a membership', async () => {
    const user = await createTestUser()

    const attempt = await reserveIdentityVerificationAttempt(user.id)

    expect(attempt).toEqual({
      id: attempt.id,
      source: 'self_paid',
      amountMinorUnits: IDENTITY_VERIFICATION_FEE_MINOR_UNITS,
    })
    expect(attempt.amountMinorUnits).toBeGreaterThan(0)
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attempt.id, source: 'self_paid', checkout_session_id: null, released_at: null },
    ])
  })

  it('includes one free attempt for an active Plus membership and rejects a second', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus', status: 'active' })

    const attempt = await reserveIdentityVerificationAttempt(user.id)

    expect(attempt).toEqual({ id: attempt.id, source: 'membership_included', amountMinorUnits: 0 })
    await expect(reserveIdentityVerificationAttempt(user.id)).rejects.toMatchObject({
      status: 409,
      message: 'Your membership-included identity verification has already been used.',
    })
  })

  it('rejects an additional paid attempt after a self-paid attempt was consumed', async () => {
    const user = await createTestUser()
    await consumeSelfPaidAttempt(user.id)

    await expect(reserveIdentityVerificationAttempt(user.id)).rejects.toMatchObject({
      status: 409,
      message:
        'Your identity verification attempt has completed. Contact support to request another attempt.',
    })
  })

  it('reserves a new zero-cost child for a released support grant and keeps the prior audit row', async () => {
    const user = await createUserWithSupportGrant()
    const first = await reserveAttachedAttempt(user.id)
    await releaseIdentityVerificationAttempt(first.checkoutSessionId)

    const retry = await reserveIdentityVerificationAttempt(user.id)

    expect(retry).toEqual({ id: retry.id, source: 'support_grant', amountMinorUnits: 0 })
    expect(retry.id).not.toBe(first.attempt.id)
    const states = await getIdentityVerificationAttemptStates(user.id)
    const entitlement = states.find(
      state => state.source === 'support_grant' && state.grant_entitlement_attempt_id === null,
    )
    expect(states.find(state => state.id === first.attempt.id)).toMatchObject({
      grant_entitlement_attempt_id: entitlement!.id,
      checkout_session_id: first.checkoutSessionId,
      released_at: expect.any(Date),
    })
    expect(states.find(state => state.id === retry.id)).toMatchObject({
      grant_entitlement_attempt_id: entitlement!.id,
      checkout_session_id: null,
      released_at: null,
    })
  })

  it('does not fall through to a paid attempt while a support-grant child is active', async () => {
    const user = await createUserWithSupportGrant()
    await reserveIdentityVerificationAttempt(user.id)

    await expect(reserveIdentityVerificationAttempt(user.id)).rejects.toMatchObject({
      status: 409,
      message: 'Your support-granted identity verification is already in progress.',
    })
    const states = await getIdentityVerificationAttemptStates(user.id)
    expect(states.filter(state => state.source === 'self_paid')).toHaveLength(1)
  })
})

describe('attachCheckoutToIdentityVerificationAttempt', () => {
  it('attaches the Checkout session and treats the same attachment as idempotent', async () => {
    const user = await createTestUser()
    const { attempt, checkoutSessionId } = await reserveAttachedAttempt(user.id)

    await expect(
      attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId),
    ).resolves.toBeUndefined()

    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attempt.id, checkout_session_id: checkoutSessionId },
    ])
  })

  it('rejects a different Checkout for an attempt that already has one', async () => {
    const user = await createTestUser()
    const { attempt, checkoutSessionId } = await reserveAttachedAttempt(user.id)

    await expect(
      attachCheckoutToIdentityVerificationAttempt(attempt.id, `cs_${v7()}`),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Identity verification attempt is no longer available.',
    })
    expect(await getIdentityVerificationAttemptStates(user.id)).toMatchObject([
      { id: attempt.id, checkout_session_id: checkoutSessionId },
    ])
  })

  it('reconciles an acknowledgement-lost attachment for its exact active attempt', async () => {
    const user = await createTestUser()
    const { attempt, checkoutSessionId } = await reserveAttachedAttempt(user.id)
    onTestFinished(rejectNextPostgresTransactionForTest(new Error('database unavailable')))

    await expect(
      attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId),
    ).resolves.toBeUndefined()
  })

  it('rethrows an attachment error when the attempt has a different Checkout', async () => {
    const user = await createTestUser()
    const { attempt } = await reserveAttachedAttempt(user.id)
    const error = new Error('database unavailable')
    onTestFinished(rejectNextPostgresTransactionForTest(error))

    await expect(
      attachCheckoutToIdentityVerificationAttempt(attempt.id, `cs_${v7()}`),
    ).rejects.toBe(error)
  })

  it('rethrows an attachment error when recovery finds a released attempt', async () => {
    const user = await createTestUser()
    const { attempt, checkoutSessionId } = await reserveAttachedAttempt(user.id)
    await releaseIdentityVerificationAttempt(checkoutSessionId)
    const error = new Error('database unavailable')
    onTestFinished(rejectNextPostgresTransactionForTest(error))

    await expect(
      attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId),
    ).rejects.toBe(error)
  })

  it('rethrows an attachment error when recovery finds a consumed attempt', async () => {
    const user = await createTestUser()
    const { attempt, checkoutSessionId } = await reserveAttachedAttempt(user.id)
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`)
    const error = new Error('database unavailable')
    onTestFinished(rejectNextPostgresTransactionForTest(error))

    await expect(
      attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId),
    ).rejects.toBe(error)
  })
})

describe('releaseReservedIdentityVerificationAttempt', () => {
  it('releases a reservation that has no Checkout', async () => {
    const user = await createTestUser()
    const attempt = await reserveIdentityVerificationAttempt(user.id)

    await releaseReservedIdentityVerificationAttempt(attempt.id)

    const [state] = await getIdentityVerificationAttemptStates(user.id)
    expect(state).toMatchObject({ id: attempt.id, released_at: expect.any(Date) })
  })

  it('leaves an attempt with an attached Checkout unreleased', async () => {
    const user = await createTestUser()
    const { attempt } = await reserveAttachedAttempt(user.id)

    await releaseReservedIdentityVerificationAttempt(attempt.id)

    const [state] = await getIdentityVerificationAttemptStates(user.id)
    expect(state).toMatchObject({ id: attempt.id, released_at: null })
  })
})
