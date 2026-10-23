import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUser,
  getTestPrivateUserById,
  insertTestTotpAuthenticator,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { getActiveTestUserSessions } from '@voucha/test-helpers/entities/user-sessions'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import { removeEmailAddress, setPrimaryEmailAddress } from '../my/email-addresses.mts'
import { deleteTotpAuthenticator } from '@services/totp'
import { completeMfaLoginWithContext } from './complete-login.mts'
import type { LoginAttempt } from './login-attempt.mts'

const deviceContext = { user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }

describe('MFA principal admission', () => {
  it.each([false, true])(
    'mints after both verified identities remain owned (suspended=%s)',
    async suspended => {
      const user = await createTestUser()
      const factor = await insertTestTotpAuthenticator(user.id, 'admission')
      if (suspended) await suspendTestUser(user.id)
      const attempt: LoginAttempt = {
        userId: user.id,
        firstFactor: { type: 'email', emailAddress: user.email_address! },
        deviceId: v7(),
        sessionId: v7(),
      }
      const verifiedAt = Math.floor(Date.now() / 1000) - 60
      const result = await completeMfaLoginWithContext(
        attempt,
        (userId, query) => getTestPrivateUserById(userId, { query }),
        { type: 'totp', authenticatorId: factor.id, verifiedAt },
        deviceContext,
      )
      expect(result.userId).toBe(user.id)
      expect(result.sessionToken.payload).toMatchObject({ uid: user.id, mfa_at: verifiedAt })
      expect(result.sessionToken.payload.sid).not.toBe(attempt.sessionId)
      if (suspended) await unsuspendTestUser(user.id)
    },
  )

  it.each(['missing', 'different'] as const)(
    'rejects a %s freshly loaded principal',
    async loaded => {
      const user = await createTestUser()
      const other = loaded === 'different' ? await createTestUser() : null
      const factor = await insertTestTotpAuthenticator(user.id, 'wrong-principal')
      await expect(
        completeMfaLoginWithContext(
          {
            userId: user.id,
            firstFactor: { type: 'email', emailAddress: user.email_address! },
            deviceId: v7(),
            sessionId: v7(),
          },
          async () => other,
          {
            type: 'totp',
            authenticatorId: factor.id,
            verifiedAt: Math.floor(Date.now() / 1000) - 60,
          },
          deviceContext,
        ),
      ).rejects.toMatchObject({ status: 401 })
      await expect(getActiveTestUserSessions(user.id)).resolves.toHaveLength(0)
    },
  )

  it('rejects the previously verified first factor after its removal', async () => {
    const user = await createTestUser()
    const factor = await insertTestTotpAuthenticator(user.id, 'first-factor-removed')
    const replacement = `tests+replacement-${v7()}@voucha.ai`
    await addVerifiedEmailForUser(user.id, replacement)
    await setPrimaryEmailAddress(user.id, replacement)
    await removeEmailAddress(user.id, user.email_address!)
    await expect(
      completeMfaLoginWithContext(
        {
          userId: user.id,
          firstFactor: { type: 'email', emailAddress: user.email_address! },
          deviceId: v7(),
          sessionId: v7(),
        },
        (userId, query) => getTestPrivateUserById(userId, { query }),
        {
          type: 'totp',
          authenticatorId: factor.id,
          verifiedAt: Math.floor(Date.now() / 1000) - 60,
        },
        deviceContext,
      ),
    ).rejects.toMatchObject({ status: 401 })
    await expect(getActiveTestUserSessions(user.id)).resolves.toHaveLength(0)
  })

  it('rejects the previously verified second factor after its removal', async () => {
    const user = await createTestUser()
    const factor = await insertTestTotpAuthenticator(user.id, 'second-factor-removed')
    await deleteTotpAuthenticator(user.id, factor.id)
    await expect(
      completeMfaLoginWithContext(
        {
          userId: user.id,
          firstFactor: { type: 'email', emailAddress: user.email_address! },
          deviceId: v7(),
          sessionId: v7(),
        },
        (userId, query) => getTestPrivateUserById(userId, { query }),
        {
          type: 'totp',
          authenticatorId: factor.id,
          verifiedAt: Math.floor(Date.now() / 1000) - 60,
        },
        deviceContext,
      ),
    ).rejects.toMatchObject({ status: 401 })
    await expect(getActiveTestUserSessions(user.id)).resolves.toHaveLength(0)
  })
})
