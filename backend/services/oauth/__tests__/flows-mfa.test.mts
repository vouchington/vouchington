import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getAndDeleteLoginAttempt } from '@services/mfa/login-attempt'
import { createTestUserDirect, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { createOAuthFlowResultForUser } from '../flows.mts'

describe('createOAuthFlowResultForUser', () => {
  it('stores the requested login attempt for a user with MFA', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')
    await insertTestTotpAuthenticator(user.id, `oauth-flow-${randomUUID()}`)
    const loginAttemptId = randomUUID()
    const deviceId = randomUUID()
    const sessionId = randomUUID()

    await expect(
      createOAuthFlowResultForUser({
        user,
        loginAttemptId,
        deviceId,
        sessionId,
        deviceClass: 'attested',
      }),
    ).resolves.toEqual({ mfaRequired: true, loginAttemptId })

    await expect(getAndDeleteLoginAttempt(loginAttemptId)).resolves.toEqual({
      userId: user.id,
      deviceId,
      sessionId,
      deviceClass: 'attested',
    })
  })
})
