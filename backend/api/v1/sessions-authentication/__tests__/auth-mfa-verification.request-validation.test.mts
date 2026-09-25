import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { createLoginAttempt, recordFailedMfaLoginAttempt } from '@services/mfa/login-attempt'
import { v7 } from 'uuid'

// Covers the post-parse runtime request-contract validation added for issue #322 on the two
// public MFA login-completion routes that key an attempt-limit counter off `login_attempt_id`.
// The counter must run before `validateRequestContract` (see response-helpers.mts docstring) so
// a malformed body against an already-limited attempt still returns 429, not 422 -- otherwise a
// caller could keep probing a limited attempt for free just by sending a schema-invalid body.
// Conversely, against a *live* (not yet limited) attempt, a wrong-typed/unknown field must still
// be rejected with a bounded 4xx rather than reaching the WebAuthn/TOTP verification call or
// crashing the counter lookup with a non-string key.
describe('MFA login verification - request contract validation', () => {
  describe('POST /api/v1/auth/mfa/totp/verification', () => {
    it('returns 422 for a non-string login_attempt_id (never reaches the attempt lookup)', async () => {
      const res = await createRequest()
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: 123, code: '123456' })
        .expect(422)

      expect(res.body.message).toContain('login_attempt_id is required')
    })

    it('returns 422 for a non-string code against a live attempt', async () => {
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-schema-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)
      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      await createRequest()
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code: 123 })
        .expect(422)
    }, 20_000)

    it('returns 429, not 422, for a malformed body once the attempt is already limited', async () => {
      const attempt = { userId: v7(), deviceId: v7(), sessionId: v7() }
      const attemptId = await createLoginAttempt(attempt)

      for (const expectedLimited of [false, false, false, false, false, true]) {
        await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(expectedLimited)
      }

      await createRequest()
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code: 123 })
        .expect(429)
    })
  })

  describe('POST /api/v1/auth/mfa/passkeys/authentication/verification', () => {
    it('returns 422 for a non-string login_attempt_id (never reaches the attempt lookup)', async () => {
      const res = await createRequest()
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ login_attempt_id: 123, response: {} })
        .expect(422)

      expect(res.body.message).toContain('login_attempt_id is required')
    })

    it('returns 422 for an unknown top-level field against a live attempt', async () => {
      const attempt = { userId: v7(), deviceId: v7(), sessionId: v7() }
      const attemptId = await createLoginAttempt(attempt)

      await createRequest()
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ login_attempt_id: attemptId, response: {}, extra: 'unexpected' })
        .expect(422)
    })

    it('returns 429, not 422, for a malformed body once the attempt is already limited', async () => {
      const attempt = { userId: v7(), deviceId: v7(), sessionId: v7() }
      const attemptId = await createLoginAttempt(attempt)

      for (const expectedLimited of [false, false, false, false, false, true]) {
        await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(expectedLimited)
      }

      await createRequest()
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ login_attempt_id: attemptId, response: {}, extra: 'unexpected' })
        .expect(429)
    })
  })
})
