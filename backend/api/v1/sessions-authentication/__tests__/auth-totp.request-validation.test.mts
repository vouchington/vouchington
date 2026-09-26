import { describe, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { v7 } from 'uuid'

// Covers the post-parse runtime request-contract validation added for issue #322 on the
// authenticated TOTP management routes (mirrors auth-passkeys.mts). These are protected routes:
// requireAuth() runs before the schema check, so an unauthenticated caller sending a
// schema-invalid body still gets a bare 401 rather than a 422 diagnostic that would leak field
// shape details before authentication. See backend/services/runtime-request-validation for the
// shared registry these tests exercise.
describe('TOTP routes - request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 15_000)

  describe('POST /api/v1/auth/totp', () => {
    it('returns 401, not 422, for a malformed body without auth', async () => {
      await createRequest()
        .post('/api/v1/auth/totp')
        .send({ name: 123, extra: 'unexpected' })
        .expect(401)
    })

    it('returns 422 for an unknown top-level field once authenticated', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req.post('/api/v1/auth/totp').send({ name: 'My App', extra: 'unexpected' }).expect(422)
    })
  })

  describe('POST /api/v1/auth/totp/setup/verification', () => {
    it('returns 422 for an unknown top-level field once authenticated', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/totp/setup/verification')
        .send({ authenticator_id: v7(), code: '123456', extra: 'unexpected' })
        .expect(422)
    })
  })

  describe.each([
    {
      method: 'patch' as const,
      body: { name: 'New Name', extra: 'unexpected' },
      // PATCH has no re-auth/MFA step, so the title doesn't claim one.
      titleSuffix: '',
    },
    {
      method: 'delete' as const,
      body: { re_auth_token: 'fake-token', extra: 'unexpected' },
      // DELETE runs deleteTotpAuthenticatorWithMfaProtection after the contract check, so this
      // also proves the schema error wins the race against the MFA-protection lookup.
      titleSuffix: ', before the MFA check',
    },
  ])('$method /api/v1/auth/totp/:id', ({ method, body, titleSuffix }) => {
    it(`returns 422 for an unknown top-level field once authenticated${titleSuffix}`, async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req[method](`/api/v1/auth/totp/${v7()}`).send(body).expect(422)
    })
  })
})
