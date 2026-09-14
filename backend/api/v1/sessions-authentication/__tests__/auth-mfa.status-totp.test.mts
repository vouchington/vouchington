import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  generateTestTotpCode,
  insertTestPasskey,
  insertTestTotpAuthenticator,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createLoginAttempt } from '@services/mfa/login-attempt'
import type { PrivateUser } from '@services/users/types'
import { v7 } from 'uuid'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  EDGE_ANON_SESSION_JWT_ISSUER,
  SESSION_EXPIRATION_SECONDS,
  signDeviceJwt,
  signSessionJwt,
} from '@ts-shared/session-jwt'

function maxAgeOf(cookieHeader: string[] | undefined, name: string): number | undefined {
  const cookie = cookieHeader?.find(c => c.startsWith(`${name}=`))
  const match = cookie?.match(/Max-Age=(\d+)/)
  return match ? Number(match[1]) : undefined
}

describe('MFA API Routes', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 15_000)

  // ─── GET /api/v1/auth/mfa/status ──────────────────────────────────────────

  describe('GET /api/v1/auth/mfa/status', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.get('/api/v1/auth/mfa/status').expect(401)
    })

    it('returns MFA status for authenticated user', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.get('/api/v1/auth/mfa/status').expect(200)

      expect(typeof res.body.has_mfa).toBe('boolean')
      expect(typeof res.body.passkeys_count).toBe('number')
      expect(typeof res.body.totp_count).toBe('number')
    })

    it('reflects passkey count accurately', async () => {
      const freshUser = await createTestUser()
      const req = createRequest()
      await req.authenticateAs(freshUser)

      const beforeRes = await req.get('/api/v1/auth/mfa/status').expect(200)
      const prevCount = beforeRes.body.passkeys_count as number

      const suffix = `status-pk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestPasskey(freshUser.id, suffix)

      const afterRes = await req.get('/api/v1/auth/mfa/status').expect(200)
      expect(afterRes.body.passkeys_count).toBe(prevCount + 1)
      expect(afterRes.body.has_mfa).toBe(true)
    }, 20_000)

    it('reflects totp count accurately', async () => {
      const freshUser = await createTestUser()
      const req = createRequest()
      await req.authenticateAs(freshUser)

      const suffix = `status-totp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(freshUser.id, suffix)

      const res = await req.get('/api/v1/auth/mfa/status').expect(200)
      expect(res.body.totp_count).toBeGreaterThanOrEqual(1)
      expect(res.body.has_mfa).toBe(true)
    }, 20_000)
  })

  // ─── POST /api/v1/auth/mfa/totp/verification ──────────────────────────────

  describe('POST /api/v1/auth/mfa/totp/verification', () => {
    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/totp/verification')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without login_attempt_id', async () => {
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ code: '123456' })
        .expect(422)

      expect(res.body.message).toContain('login_attempt_id is required')
    })

    it('returns 422 without code', async () => {
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: v7() })
        .expect(422)

      expect(res.body.message).toContain('code is required')
    })

    it('returns 401 for expired/invalid attempt', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: 'nonexistent-id', code: '123456' })
        .expect(401)
    })

    it('returns 401 for invalid TOTP code', async () => {
      // Create a real user with a TOTP authenticator
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      const req = createRequest()
      // '000000' is almost certainly the wrong code
      await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code: '000000' })
        .expect(401)
    }, 20_000)

    it('rejects valid TOTP codes after the MFA failure threshold is reached', async () => {
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-limited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      for (const expectedStatus of [401, 401, 401, 401, 401, 429]) {
        await createRequest()
          .post('/api/v1/auth/mfa/totp/verification')
          .send({ login_attempt_id: attemptId, code: '000000' })
          .expect(expectedStatus)
      }

      const code = generateTestTotpCode()
      await createRequest()
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code })
        .expect(429)
    }, 20_000)

    it('returns 403 for a suspended user with a valid TOTP code', async () => {
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-susp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      // Suspend after the login attempt is created to simulate the race window
      await suspendTestUser(mfaUser.id)

      const code = generateTestTotpCode()
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code })
        .expect(403)

      expect(res.body.message).toBe('Account suspended')

      await unsuspendTestUser(mfaUser.id)
    }, 20_000)

    it('returns 200 and mints tokens for a valid TOTP code', async () => {
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-success-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      const code = generateTestTotpCode()
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code })
        .expect(200)

      expect(res.body.user.id).toBe(mfaUser.id)
      expect(typeof res.body.dt.token).toBe('string')
      expect(typeof res.body.st.token).toBe('string')
      expect(res.body.session).toEqual(res.body.st.payload)
    }, 20_000)

    it('mints a 30-day (not 2-day) st cookie when the login attempt itself carries deviceClass', async () => {
      // deviceClass is captured on the LoginAttempt at creation time (from the device/session
      // that initiated the login), not re-derived from whatever request later completes MFA.
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-attested-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
        deviceClass: 'attested',
      })

      const code = generateTestTotpCode()
      const req = createRequest()
      const res = await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code })
        .expect(200)

      const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined
      expect(maxAgeOf(cookieHeader, 'st')).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
      expect(maxAgeOf(cookieHeader, 'st')).not.toBe(SESSION_EXPIRATION_SECONDS)
    }, 20_000)

    it('does not elevate to a 30-day session from the completing request own attested cookies', async () => {
      // Regression: a login attempt created without deviceClass (e.g. an unattested device
      // starting the login) must not be upgraded to an attested 30-day session just because
      // whatever device/browser completes the MFA step happens to carry attested dt/st
      // cookies of its own -- that device may not be the one that owns the login attempt.
      const mfaUser = await createTestUser()
      const suffix = `mfa-totp-cross-device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(mfaUser.id, suffix)

      const attemptId = await createLoginAttempt({
        userId: mfaUser.id,
        deviceId: v7(),
        sessionId: v7(),
      })

      const attestedDid = v7()
      const deviceToken = await signDeviceJwt(
        { did: attestedDid, dc: 'attested' },
        { issuer: EDGE_ANON_SESSION_JWT_ISSUER, expiresIn: '30 days' },
      )
      const sessionToken = await signSessionJwt(
        { did: attestedDid, sid: v7(), uid: null },
        { issuer: EDGE_ANON_SESSION_JWT_ISSUER, expiresIn: '2 days' },
      )

      const code = generateTestTotpCode()
      const req = createRequest()
      req.set('Cookie', `dt=${deviceToken}; st=${sessionToken}`)
      const res = await req
        .post('/api/v1/auth/mfa/totp/verification')
        .send({ login_attempt_id: attemptId, code })
        .expect(200)

      const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined
      expect(maxAgeOf(cookieHeader, 'st')).toBe(SESSION_EXPIRATION_SECONDS)
      expect(maxAgeOf(cookieHeader, 'st')).not.toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    }, 20_000)
  })
})
