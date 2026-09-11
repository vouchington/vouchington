import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestRetentionWindow,
  createTestUserDirect,
  getIdentityVerificationAttemptStates,
  getTestUserRaw,
  getVerifiedIdentityByFingerprint,
  insertTestVerifiedIdentity,
  setUserVerificationFields,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

import { DELETED_USER_ID } from '@services/users/constants'

import { cleanupSoftDeletedUsers } from '../cleanup.mts'
import {
  attachCheckoutToIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../../identity-verification/attempts.mts'
import { grantIdentityVerificationAttempt } from '../../identity-verification/attempt-grants.mts'
import {
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
} from '../../identity-verification/attempt-lifecycle.mts'

async function createTerminalFreeIdentityAttempt(userId: string): Promise<string> {
  const attempt = await reserveIdentityVerificationAttempt(userId)
  const checkoutSessionId = `cs_cleanup_${v7()}`
  await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
  await beginIdentityVerificationProviderSession(checkoutSessionId)
  await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_cleanup_${v7()}`)
  await setUserVerificationFields(userId, { verificationStatus: 'failed' })
  return checkoutSessionId
}

async function createConsumedIncludedIdentityAttempt(userId: string): Promise<string> {
  await createTestMembership({ user_id: userId, plan: 'plus', status: 'active' })
  const attempt = await reserveIdentityVerificationAttempt(userId)
  const checkoutSessionId = `cs_cleanup_included_${v7()}`
  await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
  await beginIdentityVerificationProviderSession(checkoutSessionId)
  await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_cleanup_included_${v7()}`)
  await setUserVerificationFields(userId, { verificationStatus: 'failed' })
  return checkoutSessionId
}

describe('cleanupSoftDeletedUsers identity verification', () => {
  it('reassigns and revokes verified_identities before hard-deleting (FK regression)', async () => {
    // Use a windowed sweep to avoid hard-deleting unrelated users on dirty/parallel runners.
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')

    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    const sessionId = `si_cleanup_test_${v7()}`
    await insertTestVerifiedIdentity(user.id, fingerprint, sessionId)
    // Bypass deleteUser so the row remains active at purge time and exercises the defensive
    // revoke in cleanupSoftDeletedUserBatch.
    await softDeleteUserAt(user.id, window.firstEligibleDate)

    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(user.id)).toBeNull()
    const identity = await getVerifiedIdentityByFingerprint(fingerprint)
    expect(identity?.user_id).toBe(DELETED_USER_ID)
    expect(identity?.status).toBe('revoked')
    expect(identity?.revoked_at).not.toBeNull()
  }, 60_000)

  it('pseudonymizes an identity-verification attempt before hard-deleting its owner', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    const checkoutSessionId = await createTerminalFreeIdentityAttempt(user.id)

    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(user.id)).toBeNull()
    expect(await getIdentityVerificationAttemptStates(DELETED_USER_ID)).toContainEqual(
      expect.objectContaining({ checkout_session_id: checkoutSessionId, source: 'self_paid' }),
    )
  }, 60_000)

  it('pseudonymizes a support-grant actor before hard-deleting that administrator', async () => {
    const window = createTestRetentionWindow()
    const [target, administrator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    await createTerminalFreeIdentityAttempt(target.id)
    await grantIdentityVerificationAttempt(
      target.id,
      administrator.id,
      `test support grant ${v7()}`,
    )

    await softDeleteUserAt(administrator.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(administrator.id)).toBeNull()
    expect(await getIdentityVerificationAttemptStates(target.id)).toContainEqual(
      expect.objectContaining({ source: 'support_grant', granted_by_id: DELETED_USER_ID }),
    )
  }, 60_000)

  it('keeps multiple consumed included attempts when their owners share the tombstone', async () => {
    const window = createTestRetentionWindow()
    const [firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const [firstCheckout, secondCheckout] = await Promise.all([
      createConsumedIncludedIdentityAttempt(firstUser.id),
      createConsumedIncludedIdentityAttempt(secondUser.id),
    ])

    await softDeleteUserAt(firstUser.id, window.firstEligibleDate)
    await softDeleteUserAt(secondUser.id, window.secondEligibleDate)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(firstUser.id)).toBeNull()
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
    const tombstoneAttempts = await getIdentityVerificationAttemptStates(DELETED_USER_ID)
    expect(tombstoneAttempts).toContainEqual(
      expect.objectContaining({
        checkout_session_id: firstCheckout,
        source: 'membership_included',
      }),
    )
    expect(tombstoneAttempts).toContainEqual(
      expect.objectContaining({
        checkout_session_id: secondCheckout,
        source: 'membership_included',
      }),
    )
  }, 60_000)
})
