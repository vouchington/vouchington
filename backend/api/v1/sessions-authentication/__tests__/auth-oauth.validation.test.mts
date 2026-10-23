import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'

describe('OAuth request validation', () => {
  describe.each(['facebook', 'apple'] as const)('%s provider 422 validation', provider => {
    it('PUT /connect should return 422 when token is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({})
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    })

    it('POST /continue should return 422 when token is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({})
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    })
  })

  describe('google provider 422 validation', () => {
    it('PUT /connect should return 422 when credential is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request.put('/api/v1/auth/oauth/google/connect').send({}).expect(422)
      expect(response.body.message).toBe('Invalid request body')
    })

    it('POST /continue should return 422 when credential is missing', async () => {
      const request = createRequest()
      const response = await request.post('/api/v1/auth/oauth/google/continue').send({}).expect(422)
      expect(response.body.message).toBe('Invalid request body')
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
      expect(response.body.message).toBe('Invalid request body')
    }, 15_000)

    it('PUT /connect should return 422 when redirectUri is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({ code: 'fake-code' })
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    }, 15_000)

    it('PUT /connect should return 422 when codeVerifier is missing', async () => {
      const request = createRequest()
      const user = await createTestUser()
      await request.authenticateAs(user!)
      const response = await request
        .put(`/api/v1/auth/oauth/${provider}/connect`)
        .send({
          code: 'fake-code',
          redirectUri: `/auth/callback/${provider}`,
          re_auth_token: await createTestAccountChangeProof(user.id, request),
        })
        .expect(422)
      expect(response.body.message).toContain('codeVerifier is required')
    }, 15_000)

    it('POST /continue should return 422 when code is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({})
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    })

    it('POST /continue should return 422 when redirectUri is missing', async () => {
      const request = createRequest()
      const response = await request
        .post(`/api/v1/auth/oauth/${provider}/continue`)
        .send({ code: 'fake-code' })
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
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
          .send({
            code: 'fake-code',
            redirectUri: 'not-a-url',
            codeVerifier: 'fake-verifier',
            re_auth_token: await createTestAccountChangeProof(user.id, request),
          })
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
})
