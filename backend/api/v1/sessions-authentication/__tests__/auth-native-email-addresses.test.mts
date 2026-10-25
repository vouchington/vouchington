import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import {
  createTestUser,
  getTestPrivateUserById,
  insertTestTotpAuthenticator,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { getTestUserSessionById } from '@voucha/test-helpers/entities/user-sessions'
import { createEmailAddressLoginToken } from '@services/users/authentication'
import {
  createLoginAttempt,
  getAndDeleteLoginAttempt,
  completeMfaLoginWithContext,
} from '@services/mfa'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { createDeviceAndSessionTokens } from '@services/jwt-session'

describe('native email OTP session provenance', () => {
  installEmailDomainDnsMock()

  let oldRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeEach(() => {
    oldRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, oldRateLimitConfig)
  })

  it('rejects browser-origin native OTP requests', async () => {
    await createRequest()
      .post('/api/v1/auth/native/email-address/tokens')
      .set('Origin', 'https://voucha.ai')
      .send({ emailAddress: 'native@example.test' })
      .expect(403)
    await createRequest()
      .post('/api/v1/auth/native/email-address/login')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ emailAddress: 'native@example.test', token: '123456' })
      .expect(403)
  })

  it('marks only the dedicated OTP login as native', async () => {
    const nativeUser = await createTestUser()
    const nativeToken = await createEmailAddressLoginToken(nativeUser.email_address!)
    const nativeResponse = await createRequest()
      .post('/api/v1/auth/native/email-address/login')
      .send({ emailAddress: nativeUser.email_address, token: nativeToken.token })
      .expect(200)
    await expect(getTestUserSessionById(nativeResponse.body.sid)).resolves.toMatchObject({
      authentication_origin: 'native',
    })

    const webUser = await createTestUser()
    const webToken = await createEmailAddressLoginToken(webUser.email_address!)
    const webResponse = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress: webUser.email_address, token: webToken.token })
      .expect(200)
    await expect(getTestUserSessionById(webResponse.body.sid)).resolves.toMatchObject({
      authentication_origin: 'web',
    })
  })

  it('carries native provenance from the pending MFA attempt into its completed session', async () => {
    const user = await createTestUser()
    const factor = await insertTestTotpAuthenticator(user.id, 'native-provenance')
    const attemptId = await createLoginAttempt({
      userId: user.id,
      firstFactor: { type: 'email', emailAddress: user.email_address! },
      deviceId: v7(),
      sessionId: v7(),
      authOrigin: 'native',
    })
    const attempt = await getAndDeleteLoginAttempt(attemptId)
    expect(attempt?.authOrigin).toBe('native')
    const result = await completeMfaLoginWithContext(
      attempt!,
      (userId, query) => getTestPrivateUserById(userId, { query }),
      { type: 'totp', authenticatorId: factor.id, verifiedAt: Math.floor(Date.now() / 1000) },
    )
    await expect(getTestUserSessionById(result.sessionToken.payload.sid)).resolves.toMatchObject({
      authentication_origin: 'native',
    })
  })

  it('assigns provenance from each successful login even when an existing session is supplied', async () => {
    for (const [existingOrigin, loginRoute, expectedOrigin] of [
      ['web', '/api/v1/auth/native/email-address/login', 'native'],
      ['native', '/api/v1/auth/email-address/login', 'web'],
    ] as const) {
      const user = await createTestUser()
      const existing = await createDeviceAndSessionTokens({
        did: v7(),
        uid: user.id,
        authOrigin: existingOrigin,
      })
      const token = await createEmailAddressLoginToken(user.email_address!)
      const response = await createRequest()
        .post(loginRoute)
        .send({
          emailAddress: user.email_address,
          token: token.token,
          dt: existing.deviceToken.token,
          st: existing.sessionToken.token,
        })
        .expect(200)
      expect(response.body.sid).not.toBe(existing.sessionToken.payload.sid)
      await expect(
        getTestUserSessionById(existing.sessionToken.payload.sid),
      ).resolves.toMatchObject({
        authentication_origin: existingOrigin,
      })
      await expect(getTestUserSessionById(response.body.sid)).resolves.toMatchObject({
        authentication_origin: expectedOrigin,
      })
    }
  })

  it('preserves a native provenance marker through exact credential replay', async () => {
    const user = await createTestUser()
    const initial = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      authOrigin: 'native',
    })
    const replay = await createDeviceAndSessionTokens({
      did: initial.deviceToken.payload.did,
      sid: initial.sessionToken.payload.sid,
      uid: user.id,
      credentialReplay: true,
    })
    expect(replay.deviceToken.token).toBe(initial.deviceToken.token)
    await expect(getTestUserSessionById(initial.sessionToken.payload.sid)).resolves.toMatchObject({
      authentication_origin: 'native',
    })
  })
})
