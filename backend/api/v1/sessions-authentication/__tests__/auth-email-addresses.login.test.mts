import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, nextTestRequestIp, request } from '@voucha/api/test-helpers/server'
import {
  createUniqueTestEmail,
  overrideDynamicConfigFieldsForTest,
  invalidateEmailDomainCaches,
} from '@voucha/test-helpers'

import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { isUUIDv7 } from '@ts-shared/session-jwt'
import {
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '@services/jwt-session/test-helpers/index'
import { createEmailAddressLoginToken } from '@services/users/authentication'
import {
  EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX,
  EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD,
  EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS,
} from '@services/users/authentication-flows'
import { sanitizeEmailAddress } from '@services/email-address-validator'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { v7 } from 'uuid'

describe('Email Address Authentication Routes', () => {
  let deviceToken: string
  let sessionToken: string
  let anonymousSessionId: string
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeEach(async () => {
    vi.clearAllMocks()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })

    const did = v7()
    const sid = v7()
    const tokens = await createDeviceAndSessionTokens({ did, sid })
    anonymousSessionId = sid
    deviceToken = tokens.deviceToken.token
    sessionToken = tokens.sessionToken.token
    await invalidateEmailDomainCaches()
  }, 30_000)

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  describe('POST /api/v1/auth/email-address/login', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('logs in with token or otp field and returns session payload', async () => {
      const req = createRequest()
      const emailAddress = createUniqueTestEmail('login')
      const { token } = await createEmailAddressLoginToken(emailAddress)

      const withToken = await req
        .post('/api/v1/auth/email-address/login')
        .send({
          emailAddress,
          token,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      expect(withToken.body.user).toBeDefined()
      expect(withToken.body.did).toBe(withToken.body.st.payload.did)
      expect(withToken.body.uid).toBe(withToken.body.user.id)
      expect(withToken.body.session.uid).toBe(withToken.body.uid)
      expect(withToken.body.sid).toBe(withToken.body.session.sid)
      expect(withToken.body.session.sid).not.toBe(anonymousSessionId)
      expect(withToken.body.st.payload.uid).toBe(withToken.body.uid)
      expect(withToken.body.sid).toBe(withToken.body.st.payload.sid)
      expect(withToken.body.st.payload.sid).not.toBe(anonymousSessionId)

      const otpEmail = createUniqueTestEmail('otp')
      const otpToken = await createEmailAddressLoginToken(otpEmail)

      const withOtp = await createRequest()
        .post('/api/v1/auth/email-address/login')
        .send({
          emailAddress: otpEmail,
          otp: otpToken.token,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      expect(withOtp.body.user).toBeDefined()
    })

    it('creates a new user on first login', async () => {
      const emailAddress = createUniqueTestEmail('new-user')
      const { token } = await createEmailAddressLoginToken(emailAddress)

      const response = await request
        .post('/api/v1/auth/email-address/login')
        .send({
          emailAddress,
          token,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      expect(response.body.user).toBeDefined()
      expect(response.body.uid).toBe(response.body.user.id)
    })

    it('rotates legacy anonymous dt/st ids to UUIDv7 during login', async () => {
      const legacyDid = legacyUuidV4()
      const legacySid = legacyUuidV4()
      const emailAddress = createUniqueTestEmail(`legacy-login-${legacySid.slice(0, 8)}`)
      const { token } = await createEmailAddressLoginToken(emailAddress)
      const dt = await signLegacyDeviceJwt({ did: legacyDid })
      const st = await signLegacySessionJwt({ did: legacyDid, sid: legacySid, uid: null })

      const response = await request
        .post('/api/v1/auth/email-address/login')
        .send({
          emailAddress,
          token,
          dt,
          st,
        })
        .expect(200)

      expect(response.body.user).toBeDefined()
      expect(isUUIDv7(response.body.did)).toBe(true)
      expect(isUUIDv7(response.body.sid)).toBe(true)
      expect(isUUIDv7(response.body.session.did)).toBe(true)
      expect(isUUIDv7(response.body.session.sid)).toBe(true)
      expect(response.body.did).not.toBe(legacyDid)
      expect(response.body.sid).not.toBe(legacySid)
      expect(response.body.session.did).not.toBe(legacyDid)
      expect(response.body.session.sid).not.toBe(legacySid)
    })

    it('validates required fields', async () => {
      const req = createRequest()

      const missingEmail = await req
        .post('/api/v1/auth/email-address/login')
        .send({ token: 'ABC123', dt: deviceToken, st: sessionToken })
        .expect(422)
      expect(missingEmail.body.message).toContain('emailAddress is required')

      const missingToken = await req
        .post('/api/v1/auth/email-address/login')
        .send({ emailAddress: 'tests@voucha.ai', dt: deviceToken, st: sessionToken })
        .expect(422)
      expect(missingToken.body.message).toContain('otp is required')
    })

    it('rejects invalid credentials and invalid content type', async () => {
      const req = createRequest()
      const emailAddress = 'tests@voucha.ai'
      const { token } = await createEmailAddressLoginToken(emailAddress)

      const invalidToken = await req
        .post('/api/v1/auth/email-address/login')
        .send({ emailAddress, token: 'INVALID', dt: deviceToken, st: sessionToken })
        .expect(401)
      expect(invalidToken.body.message).toContain('Invalid email address or one-time password')

      const wrongEmail = await req
        .post('/api/v1/auth/email-address/login')
        .send({
          emailAddress: 'tests+different@voucha.ai',
          token,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(401)
      expect(wrongEmail.body.message).toContain('Invalid email address or one-time password')

      await req.post('/api/v1/auth/email-address/login').send('not json').expect(415)
    })

    it('treats a literal JSON null body as empty instead of crashing', async () => {
      const response = await createRequest()
        .post('/api/v1/auth/email-address/login')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)

      expect(response.body.message).toContain('emailAddress is required')
    })

    it('returns 400 for malformed JSON and exercises the rate-limit-before-rethrow path', async () => {
      const response = await createRequest()
        .post('/api/v1/auth/email-address/login')
        .set('Content-Type', 'application/json')
        .send('{not valid json')
        .expect(400)

      expect(response.body.message).toBe('Invalid JSON')
    })

    it('returns 401 when honeypot field is filled', async () => {
      const req = createRequest()
      const emailAddress = createUniqueTestEmail('hp-login')
      const { token } = await createEmailAddressLoginToken(emailAddress)

      await req
        .post('/api/v1/auth/email-address/login')
        .send({
          emailAddress,
          token,
          hp_phone: '555-1234',
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(401)
    })

    it('rate limits repeated verification attempts', async () => {
      // The login-verify limiter (emailLoginVerifyRateLimiter) uses a real 60s sliding window
      // (Valkey ZADD/ZCOUNT). Driving it with 9 sequential HTTP round-trips races that window:
      // on a loaded shard the round-trips can take >60s, letting the earliest increments age out
      // before the 10th request, which flakily returns 401 instead of 429. Seed the same ZSET key
      // directly (same prefix + same rate-limiter Valkey client the service reads) so the count
      // reaches threshold-1 in well under a second, then make one real request to trip the limit
      // deterministically.
      const req = createRequest()
      const sharedIp = nextTestRequestIp()
      const emailAddress = createUniqueTestEmail('rate-limit')
      const seedLimiter = new RateLimiter({
        prefix: EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX,
        ttlSeconds: EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS,
      })

      for (let seed = 0; seed < EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD - 1; seed += 1) {
        await seedLimiter.addAndCheck(
          [sanitizeEmailAddress(emailAddress)],
          EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD,
        )
      }

      const tokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7() })
      const limited = await req
        .post('/api/v1/auth/email-address/login')
        .set('x-forwarded-for', sharedIp)
        .send({
          emailAddress,
          token: 'BADTOKEN',
          dt: tokens.deviceToken.token,
          st: tokens.sessionToken.token,
        })
        .expect(429)

      expect(limited.body.message).toContain('Too many requests')
    })
  })
})
