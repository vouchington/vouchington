import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  generateTestTotpCode,
  insertTestPasskey,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
import { createLoginAttempt, recordFailedMfaLoginAttempt } from '@services/mfa/login-attempt'
import type { PrivateUser } from '@services/users/types'
import { v7 } from 'uuid'

describe('MFA API Routes', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 15_000)

  // ─── POST /api/v1/auth/mfa/passkeys/authentication/options ───────────────

  describe('POST /api/v1/auth/mfa/passkeys/authentication/options', () => {
    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/passkeys/authentication/options')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without login_attempt_id', async () => {
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/passkeys/authentication/options')
        .send({})
        .expect(422)

      expect(res.body.message).toContain('login_attempt_id is required')
    })

    it('returns 401 for invalid login attempt', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/passkeys/authentication/options')
        .send({ login_attempt_id: 'nonexistent-id' })
        .expect(401)
    })

    it('returns passkey authentication options for a valid attempt', async () => {
      const passkeyUser = await createTestUser()
      const suffix = `mfa-pk-opts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestPasskey(passkeyUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: passkeyUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/passkeys/authentication/options')
        .send({ login_attempt_id: attemptId })
        .expect(200)

      expect(res.body.options).toBeDefined()
      expect(res.body.options.challenge).toBeDefined()
    }, 20_000)
  })

  // ─── POST /api/v1/auth/mfa/passkeys/authentication/verification ──────────

  describe('POST /api/v1/auth/mfa/passkeys/authentication/verification', () => {
    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without login_attempt_id', async () => {
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ response: {} })
        .expect(422)

      expect(res.body.message).toContain('login_attempt_id is required')
    })

    it('returns 422 without response', async () => {
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ login_attempt_id: v7() })
        .expect(422)

      expect(res.body.message).toContain('response is required')
    })

    it('returns 401 for invalid login attempt', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ login_attempt_id: 'nonexistent-id', response: {} })
        .expect(401)
    })

    it('rejects passkey verification after the MFA failure threshold is reached', async () => {
      const attempt = { userId: v7(), deviceId: v7(), sessionId: v7() }
      const attemptId = await createLoginAttempt(attempt)

      for (const expectedLimited of [false, false, false, false, false, true]) {
        await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(expectedLimited)
      }

      await createRequest()
        .post('/api/v1/auth/mfa/passkeys/authentication/verification')
        .send({ login_attempt_id: attemptId, response: {} })
        .expect(429)
    })
  })

  // ─── POST /api/v1/auth/mfa/re-auth/email/tokens ──────────────────────────

  describe('POST /api/v1/auth/mfa/re-auth/email/tokens', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.post('/api/v1/auth/mfa/re-auth/email/tokens').expect(401)
    })

    it('sends re-auth email and returns email_address', async () => {
      const reAuthUser = await createTestUser()
      const req = createRequest()
      await req.authenticateAs(reAuthUser)

      const res = await req.post('/api/v1/auth/mfa/re-auth/email/tokens').expect(200)

      expect(res.body.email_address).toBeTruthy()
    }, 20_000)
  })

  // ─── POST /api/v1/auth/mfa/re-auth/email/verification ────────────────────

  describe('POST /api/v1/auth/mfa/re-auth/email/verification', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/re-auth/email/verification')
        .send({ code: 'ABC123' })
        .expect(401)
    })

    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/mfa/re-auth/email/verification')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without code', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.post('/api/v1/auth/mfa/re-auth/email/verification').send({}).expect(422)

      expect(res.body.message).toContain('code is required')
    })

    it('returns 401 for invalid code', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/mfa/re-auth/email/verification')
        .send({ code: 'INVALID' })
        .expect(401)
    })
  })

  // ─── POST /api/v1/auth/mfa/re-auth/totp/verification ─────────────────────

  describe('POST /api/v1/auth/mfa/re-auth/totp/verification', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/re-auth/totp/verification')
        .send({ code: '123456' })
        .expect(401)
    })

    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/mfa/re-auth/totp/verification')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without code', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.post('/api/v1/auth/mfa/re-auth/totp/verification').send({}).expect(422)

      expect(res.body.message).toContain('code is required')
    })

    it('returns 401 for invalid TOTP code', async () => {
      const totpUser = await createTestUser()
      const suffix = `reauth-totp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(totpUser.id, suffix)

      const req = createRequest()
      await req.authenticateAs(totpUser)

      await req
        .post('/api/v1/auth/mfa/re-auth/totp/verification')
        .send({ code: '000000' })
        .expect(401)
    }, 20_000)

    it('returns re_auth_token for valid TOTP code', async () => {
      const totpUser = await createTestUser()
      const suffix = `reauth-valid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      // Use the known test secret so we can generate the valid code
      await insertTestTotpAuthenticator(totpUser.id, suffix)
      const code = generateTestTotpCode()

      const req = createRequest()
      await req.authenticateAs(totpUser)

      const res = await req
        .post('/api/v1/auth/mfa/re-auth/totp/verification')
        .send({ code })
        .expect(200)

      expect(res.body.re_auth_token).toBeTruthy()
    }, 20_000)
  })

  // ─── POST /api/v1/auth/mfa/re-auth/tokens/verification ───────────────────

  describe('POST /api/v1/auth/mfa/re-auth/tokens/verification', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/re-auth/tokens/verification')
        .send({ re_auth_token: 'some-token' })
        .expect(401)
    })

    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/mfa/re-auth/tokens/verification')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without re_auth_token', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req
        .post('/api/v1/auth/mfa/re-auth/tokens/verification')
        .send({})
        .expect(422)

      expect(res.body.code).toBe('MFA_REAUTH_REQUIRED')
    })

    it('returns 401 for expired/invalid token', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/mfa/re-auth/tokens/verification')
        .send({ re_auth_token: 'invalid-token' })
        .expect(401)
    })
  })
})
