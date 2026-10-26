import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { signSessionJwt } from '@ts-shared/session-jwt'

describe('broker connection renewal', () => {
  it('requests renewal only for an expired web identity with a signed refresh credential', async () => {
    const user = await createTestUser()
    const did = v7()
    const sid = v7()
    const userAgent = 'Synthetic browser/1.0'
    const { deviceToken } = await createDeviceAndSessionTokens({
      did,
      sid,
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    const now = Math.floor(Date.now() / 1000)
    const expiredSession = await signSessionJwt(
      { did, sid, uid: user.id },
      { issuedAt: now - 601, expiresIn: now - 1 },
    )

    const response = await createRequest()
      .post('/api/v1/auth/oauth/github/authorizations')
      .set('Cookie', `dt=${deviceToken.token}; st=${expiredSession}`)
      .set('User-Agent', userAgent)
      .send({ purpose: 'connect', callback_mode: 'web' })
      .expect(401)
    expect(response.body.code).toBe('AUTH_REQUIRED')

    const anonymous = await createRequest()
      .post('/api/v1/auth/oauth/github/authorizations')
      .send({ purpose: 'connect', callback_mode: 'web' })
      .expect(401)
    expect(anonymous.body.code).toBeUndefined()
  })
})
