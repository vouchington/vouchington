import { revokeOtherAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import { describe, expect, it } from 'vitest'
import { captureTestAccountSecurityEmail } from '@voucha/test-helpers/account-security-email'
import { v7 } from 'uuid'
import {
  createTestUser,
  getTestPrivateUserById,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
} from '../my/email-address-verification.mts'
import { getPrimaryEmailAddress, setPrimaryEmailAddress } from '../my/email-addresses.mts'
import { isSessionRevoked } from '@services/jwt-session'
import { addUserRole } from '../users/roles-permissions.mts'
import { getUserMfaStatus } from './status.mts'
import {
  createTestAccountChangeActor,
  createTestAccountChangeProof,
  consumeTestAccountChangeProof,
} from '@voucha/test-helpers/account-change'
import { withReauthenticatedAccountChange } from './account-change.mts'
import { deleteTotpAuthenticatorWithMfaProtection } from './protected-mfa-delete.mts'

// Exercise the shared mutation boundary with the real stores and email queue.
describe('account settings changes', () => {
  it('notifies the old primary, revokes the other session and consumes its proof once', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const other = await createTestAccountChangeActor(user.id)
    const address = `tests+fresh-${v7()}@voucha.ai`
    const verification = await createEmailVerificationToken(user.id, address)
    await verifyEmailVerificationToken(user.id, address, verification.token)
    const token = await createTestAccountChangeProof(user.id, actor.session)
    const notification = await captureTestAccountSecurityEmail(user.email_address!, () =>
      withReauthenticatedAccountChange(user.id, actor.session, token, query =>
        setPrimaryEmailAddress(user.id, address, { query }),
      ),
    )
    expect(notification).toMatchObject({
      name: 'processSendAccountSecurityEmail',
      data: { input: { emailAddress: user.email_address }, variables: {} },
    })
    const issuedAt = Math.floor(Date.now() / 1000) - 1
    await expect(
      isSessionRevoked(other.sessionToken.payload.sid, { userId: user.id, issuedAt }),
    ).resolves.toBe(true)
    await expect(
      isSessionRevoked(actor.sessionToken.payload.sid, { userId: user.id, issuedAt }),
    ).resolves.toBe(false)
    await expect(
      withReauthenticatedAccountChange(user.id, actor.session, token, async () => {}),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('allows only one concurrent mutation to consume the same proof', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const token = await createTestAccountChangeProof(user.id, actor.session)
    let changed = 0
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        withReauthenticatedAccountChange(user.id, actor.session, token, async () => {
          changed += 1
        }),
      ),
    )
    expect(changed).toBe(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })

  it('rolls back the proof, actual primary mutation and other-session revocation together', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const other = await createTestAccountChangeActor(user.id)
    const address = `tests+rollback-${v7()}@voucha.ai`
    const verification = await createEmailVerificationToken(user.id, address)
    await verifyEmailVerificationToken(user.id, address, verification.token)
    const token = await createTestAccountChangeProof(user.id, actor.session)
    const failure = new Error('owned change rejected before commit')
    await expect(
      withReauthenticatedAccountChange(user.id, actor.session, token, async query => {
        await setPrimaryEmailAddress(user.id, address, { query })
        await revokeOtherAuthenticatedSessions(user.id, actor.session.sid, { query })
        throw failure
      }),
    ).rejects.toBe(failure)
    await expect(getPrimaryEmailAddress(user.id)).resolves.toBe(user.email_address)
    await expect(isSessionRevoked(other.session.sid, { userId: user.id })).resolves.toBe(false)
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(true)
  })

  it('rejects an actor revoked by a concurrently committed account change', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const other = await createTestAccountChangeActor(user.id)
    const [actorToken, otherToken] = await Promise.all([
      createTestAccountChangeProof(user.id, actor.session),
      createTestAccountChangeProof(user.id, other.session),
    ])
    const outcomes = await Promise.allSettled([
      withReauthenticatedAccountChange(user.id, actor.session, actorToken, async () => 'actor'),
      withReauthenticatedAccountChange(user.id, other.session, otherToken, async () => 'other'),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toMatchObject([
      { reason: { status: 401 } },
    ])
  })

  it('requires an MFA enrollment before granting the administrator role', async () => {
    const user = await createTestUser()
    await expect(addUserRole(user.id, 'administrator')).rejects.toMatchObject({ status: 403 })
  })

  it('serializes an administrator grant with removal of the last factor', async () => {
    const user = await createTestUser()
    const factor = await insertTestTotpAuthenticator(user.id, 'role-race')
    const actor = await createTestAccountChangeActor(user.id)
    const token = await createTestAccountChangeProof(user.id, actor.session)
    const outcomes = await Promise.allSettled([
      addUserRole(user.id, 'administrator'),
      deleteTotpAuthenticatorWithMfaProtection(user.id, factor.id, token, actor.session),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const current = await getTestPrivateUserById(user.id)
    const mfa = await getUserMfaStatus(user.id)
    expect(current?.roles.includes('administrator') && !mfa.hasMfa).toBe(false)
  })

  it('keeps the last administrator factor even with fresh authentication', async () => {
    const user = await createTestUser()
    const factor = await insertTestTotpAuthenticator(user.id, 'last-admin')
    await addUserRole(user.id, 'administrator')
    const actor = await createTestAccountChangeActor(user.id)
    await expect(
      deleteTotpAuthenticatorWithMfaProtection(
        user.id,
        factor.id,
        await createTestAccountChangeProof(user.id, actor.session),
        actor.session,
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
})
