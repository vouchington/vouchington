import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUser,
  getTestPrivateUserById,
  insertTestTotpAuthenticator,
  generateTestTotpCode,
} from '@voucha/test-helpers'
import { getActiveTestUserSessions } from '@voucha/test-helpers/entities/user-sessions'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import {
  connectTestOAuthAccount,
  insertTestOAuthAccount,
} from '@voucha/test-helpers/entities/oauth-accounts'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import { deleteTotpAuthenticator, verifyTotpCode } from '@services/totp'
import { removeEmailAddress, setPrimaryEmailAddress } from '../my/email-addresses.mts'
import { disconnectOAuthAccount } from '../my/oauth-account.mts'
import { completeMfaLoginWithContext } from './complete-login.mts'
import type { LoginAttempt } from './login-attempt.mts'

// Interleave real method removal after successful OTP consumption and before authority minting.
describe('credential admission after factor verification', () => {
  it.each(['email', 'provider', 'totp'] as const)(
    'does not mint the prior principal when its verified %s is removed in the handoff',
    async removed => {
      const user = await createTestUser()
      const factor = await insertTestTotpAuthenticator(user.id, 'credential-handoff')
      const providerUserId = `handoff-${v7()}`
      if (removed === 'email') {
        const replacement = `tests+replacement-${v7()}@voucha.ai`
        await addVerifiedEmailForUser(user.id, replacement)
        await setPrimaryEmailAddress(user.id, replacement)
      }
      if (removed === 'provider') {
        await insertTestOAuthAccount('github', providerUserId)
        await connectTestOAuthAccount('github', user.id, providerUserId)
      }
      const attempt: LoginAttempt = {
        userId: user.id,
        firstFactor:
          removed === 'provider'
            ? { type: 'provider', provider: 'github', providerUserId }
            : { type: 'email', emailAddress: user.email_address! },
        deviceId: v7(),
        sessionId: v7(),
      }
      await expect(
        observeTestPostgresQueryPools(
          'consumeTotpTimeSteps',
          async () => {
            const verified = await verifyTotpCode(user.id, generateTestTotpCode())
            if (!verified) throw new Error('Expected a real successfully consumed factor')
            return completeMfaLoginWithContext(
              attempt,
              (userId, query) => getTestPrivateUserById(userId, { query }),
              {
                type: 'totp',
                authenticatorId: verified.authenticatorId,
                verifiedAt: Math.floor(Date.now() / 1000),
              },
              { user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' },
            )
          },
          () =>
            removed === 'email'
              ? removeEmailAddress(user.id, user.email_address!)
              : removed === 'provider'
                ? disconnectOAuthAccount(user.id, 'github')
                : deleteTotpAuthenticator(user.id, factor.id),
        ),
      ).rejects.toMatchObject({ status: 401 })
      await expect(getActiveTestUserSessions(user.id)).resolves.toHaveLength(0)
    },
  )
})
