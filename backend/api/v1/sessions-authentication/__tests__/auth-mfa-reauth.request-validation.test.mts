import { describe, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// Covers the post-parse runtime request-contract validation added for issue #322 on the three
// authenticated MFA re-auth routes (email/totp verification, re-auth token verification). These
// are protected routes: requireAuth() must run before the schema check, so an unauthenticated
// caller sending a schema-invalid body still gets a bare 401 rather than a 422 diagnostic that
// would leak field-shape details before authentication. See
// backend/services/runtime-request-validation for the shared registry these tests exercise.
describe('MFA re-auth routes - request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 15_000)

  describe('POST /api/v1/auth/mfa/re-auth/email/verification', () => {
    it('returns 401, not 422, for a malformed body without auth', async () => {
      await createRequest()
        .post('/api/v1/auth/mfa/re-auth/email/verification')
        .send({ code: 123, extra: 'unexpected' })
        .expect(401)
    })

    it('returns 422 for a non-string code once authenticated', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req.post('/api/v1/auth/mfa/re-auth/email/verification').send({ code: 123 }).expect(422)
    })
  })

  describe('POST /api/v1/auth/mfa/re-auth/totp/verification', () => {
    it('returns 401, not 422, for a malformed body without auth', async () => {
      await createRequest()
        .post('/api/v1/auth/mfa/re-auth/totp/verification')
        .send({ code: 123, extra: 'unexpected' })
        .expect(401)
    })

    it('returns 422 for a non-string code once authenticated', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req.post('/api/v1/auth/mfa/re-auth/totp/verification').send({ code: 123 }).expect(422)
    })
  })

  describe('POST /api/v1/auth/mfa/re-auth/tokens/verification', () => {
    it('returns 401, not 422, for a malformed body without auth', async () => {
      await createRequest()
        .post('/api/v1/auth/mfa/re-auth/tokens/verification')
        .send({ re_auth_token: 123, extra: 'unexpected' })
        .expect(401)
    })

    it('returns 422 for a non-string re_auth_token once authenticated', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/mfa/re-auth/tokens/verification')
        .send({ re_auth_token: 123 })
        .expect(422)
    })
  })
})
