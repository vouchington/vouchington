import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { addUserRole } from '@services/users/roles-permissions'

const mutations = [
  { method: 'post', path: '/api/v1/auth/bluesky/link', body: { handle: 'alice.test' } },
  { method: 'delete', path: '/api/v1/auth/bluesky/link', body: {} },
  {
    method: 'post',
    path: '/api/v1/auth/oauth/github/authorizations',
    body: { purpose: 'connect', callback_mode: 'web' },
  },
  {
    method: 'post',
    path: '/api/v1/my/email-addresses',
    body: { email_address: 'tests+fresh@voucha.ai' },
  },
  {
    method: 'post',
    path: '/api/v1/my/email-addresses/tests%2Bfresh%40voucha.ai/verifications',
    body: { token: 'ABCDEFGHIJ' },
  },
  {
    method: 'patch',
    path: '/api/v1/my/email-addresses/tests%2Bfresh%40voucha.ai',
    body: { is_primary: true },
  },
  { method: 'delete', path: '/api/v1/my/email-addresses/tests%2Bfresh%40voucha.ai', body: {} },
  { method: 'post', path: '/api/v1/auth/passkeys/registration/verify', body: { response: {} } },
  { method: 'delete', path: `/api/v1/auth/passkeys/${v7()}`, body: {} },
  { method: 'post', path: '/api/v1/auth/totp', body: {} },
  {
    method: 'post',
    path: '/api/v1/auth/totp/setup/verification',
    body: { authenticator_id: v7(), code: '123456' },
  },
  { method: 'delete', path: `/api/v1/auth/totp/${v7()}`, body: {} },
  { method: 'put', path: '/api/v1/auth/oauth/google/connect', body: { token: 'provider-proof' } },
  { method: 'delete', path: '/api/v1/auth/oauth/google/connect', body: {} },
] as const

describe('fresh authentication for account settings', () => {
  it.each(mutations)(
    'requires fresh authentication for $method $path',
    async ({ method, path, body }) => {
      const user = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request[method](path).send(body).expect(403)
      expect(response.body.code).toBe('MFA_REAUTH_REQUIRED')
    },
  )

  it('revokes another session after adding a factor while retaining the acting session', async () => {
    const user = await createTestUser()
    const actor = createRequest()
    const other = createRequest()
    await actor.authenticateAs(user)
    await other.authenticateAs(user)
    await actor
      .post('/api/v1/auth/totp')
      .send({ re_auth_token: await createTestAccountChangeProof(user.id, actor) })
      .expect(200)
    await actor.get('/api/v1/auth/mfa/status').expect(200)
    await other.get('/api/v1/auth/mfa/status').expect(401)
  })

  it('does not grant administrator access to a session that has only enrolled a factor', async () => {
    const user = await createTestUser()
    const session = await createDeviceAndSessionTokens({ did: v7(), uid: user.id })
    await insertTestTotpAuthenticator(user.id, 'administrator')
    await addUserRole(user.id, 'administrator')
    await createRequest()
      .get('/api/v1/admin/oauth-clients')
      .set('Cookie', `dt=${session.deviceToken.token}; st=${session.sessionToken.token}`)
      .expect(403)
    const verified = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      mfaVerifiedAt: Math.floor(Date.now() / 1000) - 60,
    })
    await createRequest()
      .get('/api/v1/admin/oauth-clients')
      .set('Cookie', `dt=${verified.deviceToken.token}; st=${verified.sessionToken.token}`)
      .expect(200)
  })
})
