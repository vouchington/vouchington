import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const providers = ['facebook', 'apple', 'google', 'x', 'linkedin', 'microsoft'] as const

describe('OAuth Authentication Routes', () => {
  it('returns configured OAuth providers without requiring auth', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/auth/oauth/providers').expect(200)

    expect(response.body).toEqual({
      providers: expect.any(Array),
      broker_capabilities: {
        facebook: {
          version: 1,
          modes: { web: false, native: false },
          purposes: ['authenticate', 'connect'],
        },
        x: {
          version: 1,
          modes: { web: false, native: false },
          purposes: ['authenticate', 'connect'],
        },
        github: {
          version: 1,
          modes: { web: false, native: false },
          purposes: ['authenticate', 'connect'],
        },
      },
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers.vary).toBeUndefined()
  })

  describe.each(providers)('%s provider', provider => {
    describe(`PUT /api/v1/auth/oauth/${provider}/connect`, () => {
      it('should return 401 when user is not logged in', async () => {
        const request = createRequest()
        const response = await request
          .put(`/api/v1/auth/oauth/${provider}/connect`)
          .send({ token: 'fake-token' })
          .expect(401)

        expect(response.body.message).toContain('Unauthorized')
      })

      it('should return 415 for invalid Content-Type', async () => {
        const request = createRequest()
        const user = await createTestUser()
        await request.authenticateAs(user!)
        await request
          .put(`/api/v1/auth/oauth/${provider}/connect`)
          .set('Content-Type', 'text/plain')
          .send('not json')
          .expect(415)
      })
    })

    describe(`DELETE /api/v1/auth/oauth/${provider}/connect`, () => {
      it('should return 401 when user is not logged in', async () => {
        const request = createRequest()
        const response = await request.delete(`/api/v1/auth/oauth/${provider}/connect`).expect(401)
        expect(response.body.message).toContain('Unauthorized')
      })

      it('should return 404 when no account connected', async () => {
        const request = createRequest()
        const user = await createTestUser()
        await request.authenticateAs(user!)
        await request.delete(`/api/v1/auth/oauth/${provider}/connect`).expect(404)
      })

      describe(`with ${provider} account connected`, () => {
        let oauthUser: PrivateUser
        let providerUserId: string

        beforeAll(async () => {
          oauthUser = await createTestUser()
          providerUserId = `test-${provider}-${createRandomString(10)}`
          await insertTestOAuthAccount(provider, providerUserId, `${providerUserId}@test.com`)
          await connectTestOAuthAccount(provider, oauthUser.id, providerUserId)
        })

        it('disconnects when user also has an email', async () => {
          const request = createRequest()
          await request.authenticateAs(oauthUser)
          await request.delete(`/api/v1/auth/oauth/${provider}/connect`).expect(204)
        })

        it('returns 400 when this is the only auth method', async () => {
          const noEmailUser = await createTestUser()
          const uid = `test-${provider}-${createRandomString(10)}`
          await insertTestOAuthAccount(provider, uid, `${uid}@test.com`)
          await connectTestOAuthAccount(provider, noEmailUser.id, uid)

          const request = createRequest()
          await request.authenticateAs(noEmailUser)

          // Remove the email so the OAuth account is the only auth method
          const emailRes = await request.get('/api/v1/my/email-addresses').expect(200)
          const primaryEmail = emailRes.body.results[0]
          await request
            .delete(`/api/v1/my/email-addresses/${encodeURIComponent(primaryEmail.email_address)}`)
            .expect(204)

          // Disconnect should fail
          await request.delete(`/api/v1/auth/oauth/${provider}/connect`).expect(400)
        })
      })
    })

    describe(`POST /api/v1/auth/oauth/${provider}/continue`, () => {
      it('should return current user when already logged in', async () => {
        const request = createRequest()
        const user = await createTestUser()
        await request.authenticateAs(user!)

        const response = await request
          .post(`/api/v1/auth/oauth/${provider}/continue`)
          .send({ token: 'fake-token' })
          .expect(200)

        expect(response.body.user.id).toBe(user.id)
      })

      it('should return 415 for invalid Content-Type', async () => {
        const request = createRequest()
        await request
          .post(`/api/v1/auth/oauth/${provider}/continue`)
          .set('Content-Type', 'text/plain')
          .send('not json')
          .expect(415)
      })
    })
  })

  describe.each(['facebook', 'apple'] as const)('%s provider 422 validation', provider => {
    it('PUT /connect should return 422 when token is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({})
        .expect(422)
      expect(response.body.message).toContain('token is required')
    })

    it('POST /continue should return 422 when token is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({})
        .expect(422)
      expect(response.body.message).toContain('token is required')
    })
  })

  describe('google provider 422 validation', () => {
    it('PUT /connect should return 422 when credential is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request.put('/api/v1/auth/oauth/google/connect').send({}).expect(422)
      expect(response.body.message).toContain('credential is required')
    })

    it('POST /continue should return 422 when credential is missing', async () => {
      const request = createRequest()
      const response = await request.post('/api/v1/auth/oauth/google/continue').send({}).expect(422)
      expect(response.body.message).toContain('credential is required')
    })
  })

  describe.each(['x', 'linkedin', 'microsoft'] as const)('%s provider 422 validation', provider => {
    it('PUT /connect should return 422 when code is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({})
        .expect(422)
      expect(response.body.message).toContain('code is required')
    }, 15_000)

    it('PUT /connect should return 422 when redirectUri is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({ code: 'fake-code' })
        .expect(422)
      expect(response.body.message).toContain('redirectUri is required')
    }, 15_000)

    it('PUT /connect should return 422 when codeVerifier is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({ code: 'fake-code', redirectUri: `/auth/callback/${provider}` })
        .expect(422)
      expect(response.body.message).toContain('codeVerifier is required')
    }, 15_000)

    it('POST /continue should return 422 when code is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({})
        .expect(422)
      expect(response.body.message).toContain('code is required')
    })

    it('POST /continue should return 422 when redirectUri is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({ code: 'fake-code' })
        .expect(422)
      expect(response.body.message).toContain('redirectUri is required')
    })

    it('POST /continue should return 422 when codeVerifier is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({ code: 'fake-code', redirectUri: `/auth/callback/${provider}` })
        .expect(422)
      expect(response.body.message).toContain('codeVerifier is required')
    })
  })

  describe.each(['x', 'linkedin', 'microsoft'] as const)(
    '%s provider redirectUri validation',
    provider => {
      it('PUT /connect should return 422 when redirectUri is not a valid URL', async () => {
        const request = createRequest()
        const user = await createTestUser()
        await request.authenticateAs(user!)
        await request
          .put(`/api/v1/auth/oauth/${provider}/connect`)
          .send({ code: 'fake-code', redirectUri: 'not-a-url', codeVerifier: 'fake-verifier' })
          .expect(422)
      }, 15_000)

      it('POST /continue should return 422 when redirectUri is not a valid URL', async () => {
        const request = createRequest()
        await request
          .post(`/api/v1/auth/oauth/${provider}/continue`)
          .send({ code: 'fake-code', redirectUri: 'not-a-url', codeVerifier: 'fake-verifier' })
          .expect(422)
      }, 15_000)
    },
  )

  describe('invalid provider', () => {
    it('should return 400 for unknown provider', async () => {
      const request = createRequest()
      await request.post('/api/v1/auth/oauth/unknown-provider/continue').send({}).expect(400)
    })
  })
})
