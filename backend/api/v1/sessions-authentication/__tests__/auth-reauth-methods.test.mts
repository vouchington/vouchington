import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  connectTestOAuthAccount,
  createTestUser,
  createTestUserDirect,
  insertTestOAuthAccount,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
import { getConfiguredOAuthProviders } from '../../../../services/oauth-accounts/configuration.mts'

describe('GET /api/v1/auth/re-auth/methods', () => {
  it('requires an authenticated actor', async () => {
    await createRequest().get('/api/v1/auth/re-auth/methods').expect(401)
  })

  it('discovers an email sign-in method without MFA enrollment', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/auth/re-auth/methods').expect(200)
    expect(response.body).toMatchObject({ has_email: true, has_totp: false, has_passkey: false })
    expect(response.body.providers).toEqual([])
  })

  it('discovers a verified TOTP factor for the acting user', async () => {
    const user = await createTestUser()
    await insertTestTotpAuthenticator(user.id, 'discovery')
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/auth/re-auth/methods').expect(200)
    expect(response.body).toMatchObject({ has_email: true, has_totp: true })
  })

  it('discovers only configured providers already linked to an email-free user', async () => {
    const user = await createTestUserDirect()
    const providerUserId = randomUUID()
    await insertTestOAuthAccount('google', providerUserId, `tests+${providerUserId}@voucha.ai`)
    await connectTestOAuthAccount('google', user.id, providerUserId)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/auth/re-auth/methods').expect(200)
    expect(response.body.has_email).toBe(false)
    expect(response.body.providers).toEqual(
      getConfiguredOAuthProviders().filter(provider => provider === 'google'),
    )
  })
})
