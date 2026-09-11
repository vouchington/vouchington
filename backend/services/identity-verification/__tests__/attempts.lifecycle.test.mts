import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  getIdentityVerificationAttemptStates,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import {
  attachCheckoutToIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../attempts.mts'
import { grantIdentityVerificationAttempt } from '../attempt-grants.mts'
import {
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
  releaseIdentityVerificationAttempt,
} from '../attempt-lifecycle.mts'

describe('support-grant identity verification attempts', () => {
  async function createTerminalFreeAttempt(userId: string): Promise<void> {
    const attempt = await reserveIdentityVerificationAttempt(userId)
    const checkoutSessionId = `cs_${v7()}`
    await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`)
    await setUserVerificationFields(userId, { verificationStatus: 'failed' })
  }

  it('rejects a support grant before a terminal self-paid Free attempt', async () => {
    const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])

    await expect(
      grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('allows exactly one outstanding support grant after a terminal Free attempt', async () => {
    const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])
    await createTerminalFreeAttempt(user!.id)
    await grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`)

    await expect(
      grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `duplicate grant ${v7()}`),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('serializes concurrent support grants to one durable entitlement', async () => {
    const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])
    await createTerminalFreeAttempt(user!.id)

    const results = await Promise.allSettled([
      grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`),
      grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })

  it('permits only one active child for a grant under concurrent reservations', async () => {
    const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])
    await createTerminalFreeAttempt(user!.id)
    await grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`)

    const results = await Promise.allSettled([
      reserveIdentityVerificationAttempt(user!.id),
      reserveIdentityVerificationAttempt(user!.id),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    })
  })

  it('keeps a released Checkout child immutable and uses the grant for one retry', async () => {
    const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])
    await createTerminalFreeAttempt(user!.id)
    await grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`)

    const first = await reserveIdentityVerificationAttempt(user!.id)
    const firstCheckout = `cs_${v7()}`
    await attachCheckoutToIdentityVerificationAttempt(first.id, firstCheckout)
    await releaseIdentityVerificationAttempt(firstCheckout)

    const retry = await reserveIdentityVerificationAttempt(user!.id)
    expect(retry.id).not.toBe(first.id)
    const retryCheckout = `cs_${v7()}`
    await attachCheckoutToIdentityVerificationAttempt(retry.id, retryCheckout)
    await beginIdentityVerificationProviderSession(retryCheckout)
    await consumeIdentityVerificationAttempt(retryCheckout, `vs_${v7()}`)

    const attempts = await getIdentityVerificationAttemptStates(user!.id)
    const released = attempts.find(attempt => attempt.id === first.id)
    const consumed = attempts.find(attempt => attempt.id === retry.id)
    expect(released).toMatchObject({
      checkout_session_id: firstCheckout,
      released_at: expect.any(Date),
    })
    expect(consumed).toMatchObject({
      checkout_session_id: retryCheckout,
      consumed_at: expect.any(Date),
    })
    await expect(reserveIdentityVerificationAttempt(user!.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('allows a paid membership entitlement after a support-grant child was consumed', async () => {
    const [user, supportAgent] = await Promise.all([createTestUser(), createTestUser()])
    await createTerminalFreeAttempt(user!.id)
    await grantIdentityVerificationAttempt(user!.id, supportAgent!.id, `test grant ${v7()}`)
    const grantAttempt = await reserveIdentityVerificationAttempt(user!.id)
    const checkoutSessionId = `cs_${v7()}`
    await attachCheckoutToIdentityVerificationAttempt(grantAttempt.id, checkoutSessionId)
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`)
    await createTestMembership({ user_id: user!.id, plan: 'plus', status: 'active' })

    await expect(reserveIdentityVerificationAttempt(user!.id)).resolves.toMatchObject({
      source: 'membership_included',
      amountMinorUnits: 0,
    })
  })
})
