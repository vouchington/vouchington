import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getAndDeleteLoginAttempt } from '@services/mfa/login-attempt'
import { createTestUserDirect, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { prepareOAuthAccountPersistence } from '@services/oauth-accounts/prepared-account'
import { getTestOAuthAccountRaw } from '@voucha/test-helpers/entities/oauth-account-raw'
import { connectOAuthAccountFlow, createOAuthFlowResultForUser } from '../flows.mts'

describe('createOAuthFlowResultForUser', () => {
  it('stores the requested login attempt for a user with MFA', async () => {
    const user = await createTestUserDirect({ withEmail: true })
    if (!user) throw new Error('Failed to create test user')
    await insertTestTotpAuthenticator(user.id, `oauth-flow-${randomUUID()}`)
    const loginAttemptId = randomUUID()
    const deviceId = randomUUID()
    const sessionId = randomUUID()

    await expect(
      createOAuthFlowResultForUser({
        user,
        firstFactor: { type: 'email', emailAddress: user.email_address! },
        loginAttemptId,
        deviceId,
        sessionId,
        deviceClass: 'attested',
      }),
    ).resolves.toEqual({ mfaRequired: true, loginAttemptId })

    await expect(getAndDeleteLoginAttempt(loginAttemptId)).resolves.toEqual({
      userId: user.id,
      firstFactor: { type: 'email', emailAddress: user.email_address! },
      deviceId,
      sessionId,
      deviceClass: 'attested',
    })
  })
})

describe('deferred OAuth account connection', () => {
  it('persists verified provider facts and links only the intended current user', async () => {
    const user = await createTestUserDirect({ withEmail: true })
    const providerUserId = `github-${randomUUID()}`
    const prepared = prepareOAuthAccountPersistence('github', providerUserId, null, {
      name: 'Verified provider name',
    })

    const result = await connectOAuthAccountFlow({
      provider: 'github',
      currentUserId: user.id,
      prepared,
    })

    expect(result.account.provider_user_id).toBe(providerUserId)
    expect(result.name).toBe('Verified provider name')
    expect(await getTestOAuthAccountRaw('github', providerUserId)).toMatchObject({
      user_id: user.id,
    })

    const refreshed = prepareOAuthAccountPersistence('github', providerUserId, null, {
      name: 'Updated verified provider name',
    })
    await refreshed.persist()
    expect(await getTestOAuthAccountRaw('github', providerUserId)).toMatchObject({
      user_id: user.id,
    })
  })
})
