import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readFileSync } from 'node:fs'
import { validateResponseContract } from '../../../../test-helpers/api-fixtures/contract-schema.mts'
import type { ApiFixtureManifest } from '../../../../test-helpers/api-fixtures/types.mts'
import {
  createTestUser,
  createTestUserDirect,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const providers = ['facebook', 'apple', 'google', 'x', 'linkedin', 'microsoft'] as const
const apiManifest = JSON.parse(
  readFileSync(new URL('../../../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
) as ApiFixtureManifest
const providerResponseContract =
  apiManifest.backendResponseContracts['GET:/api/v1/auth/oauth/providers']!

describe('OAuth Authentication Routes', () => {
  it('returns configured OAuth providers without requiring auth', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/auth/oauth/providers').expect(200)
    expect(validateResponseContract(providerResponseContract.schema, response.body)).toEqual([])

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
        linkedin: {
          version: 1,
          modes: { web: false, native: false },
          purposes: ['authenticate', 'connect'],
        },
        microsoft: {
          version: 1,
          modes: { web: false, native: false },
          purposes: ['authenticate', 'connect'],
        },
        google: {
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
        await request
          .delete(`/api/v1/auth/oauth/${provider}/connect`)
          .send({ re_auth_token: await createTestAccountChangeProof(user.id, request) })
          .expect(404)
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
          await request
            .delete(`/api/v1/auth/oauth/${provider}/connect`)
            .send({ re_auth_token: await createTestAccountChangeProof(oauthUser.id, request) })
            .expect(204)
        })

        it('returns 400 when this is the only auth method', async () => {
          const noEmailUser = await createTestUserDirect()
          const uid = `test-${provider}-${createRandomString(10)}`
          await insertTestOAuthAccount(provider, uid, `${uid}@test.com`)
          await connectTestOAuthAccount(provider, noEmailUser.id, uid)

          const request = createRequest()
          await request.authenticateAs(noEmailUser)

          // Disconnect should fail
          await request
            .delete(`/api/v1/auth/oauth/${provider}/connect`)
            .send({ re_auth_token: await createTestAccountChangeProof(noEmailUser.id, request) })
            .expect(400)
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

  describe('invalid provider', () => {
    it('should return 400 for unknown provider', async () => {
      const request = createRequest()
      await request.post('/api/v1/auth/oauth/unknown-provider/continue').send({}).expect(400)
    })
  })
})
