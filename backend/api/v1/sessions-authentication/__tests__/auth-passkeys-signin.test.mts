import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import {
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '@services/jwt-session/test-helpers/index'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  EDGE_ANON_SESSION_JWT_ISSUER,
  SESSION_EXPIRATION_SECONDS,
  signDeviceJwt,
  signSessionJwt,
} from '@ts-shared/session-jwt'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'

function maxAgeOf(cookieHeader: string[] | undefined, name: string): number | undefined {
  const cookie = cookieHeader?.find(c => c.startsWith(`${name}=`))
  const match = cookie?.match(/Max-Age=(\d+)/)
  return match ? Number(match[1]) : undefined
}

/**
 * Create an anonymous (uid: null) device+session pair and set them on the agent.
 * This ensures a stable device ID across all requests in a test (options + verify
 * must use the same `dt` cookie so the challenge key matches).
 */
async function createAnonymousRequest() {
  const req = createRequest()
  const did = v7()
  const sid = v7()
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did,
    sid,
    uid: null,
  })
  req.set('Cookie', `dt=${deviceToken.token}; st=${sessionToken.token}`)
  return req
}

describe('Discoverable Passkey Sign-In Routes', () => {
  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  }, 15_000)

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  // ─── Authentication options (no auth required) ────────────────────────────

  describe('POST /api/v1/auth/passkeys/authentication/options', () => {
    it('returns WebAuthn options with userVerification required and empty allowCredentials', async () => {
      const req = await createAnonymousRequest()
      const res = await req
        .post('/api/v1/auth/passkeys/authentication/options')
        .send({})
        .expect(200)

      expect(res.body.options.challenge).toBeDefined()
      expect(res.body.options.userVerification).toBe('required')
      expect(res.body.options.allowCredentials).toHaveLength(0)
    })

    it('works for an anonymous (unauthenticated) request', async () => {
      const req = await createAnonymousRequest()
      const res = await req
        .post('/api/v1/auth/passkeys/authentication/options')
        .send({})
        .expect(200)

      expect(res.body.options).toBeDefined()
    })

    it('sets anonymous auth cookies so verify uses the same device challenge', async () => {
      const req = createRequest()
      const optionsRes = await req
        .post('/api/v1/auth/passkeys/authentication/options')
        .send({})
        .expect(200)

      const cookieHeader = optionsRes.headers['set-cookie'] as unknown as string[] | undefined
      expect(cookieHeader?.some(cookie => cookie.startsWith('dt='))).toBe(true)
      expect(cookieHeader?.some(cookie => cookie.startsWith('st='))).toBe(true)

      const verifyRes = await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: { id: 'nonexistent-credential-id' } })
        .expect(401)

      expect(verifyRes.body.message).toContain('Passkey sign-in failed')
    })

    it('stores the challenge under the rotated legacy device id', async () => {
      const req = createRequest()
      const did = legacyUuidV4()
      const sid = legacyUuidV4()
      const deviceToken = await signLegacyDeviceJwt({ did })
      const sessionToken = await signLegacySessionJwt({ did, sid, uid: null })
      req.set('Cookie', `dt=${deviceToken}; st=${sessionToken}`)

      await req.post('/api/v1/auth/passkeys/authentication/options').send({}).expect(200)

      const verifyRes = await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: { id: 'nonexistent-credential-id' } })
        .expect(401)
      expect(verifyRes.body.message).toContain('Passkey sign-in failed')
    })

    it('preserves an already-attested device by minting a 30-day (not 2-day) st cookie', async () => {
      const req = createRequest()
      const did = v7()
      const sid = v7()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did,
        sid,
        uid: null,
        deviceClass: 'attested',
      })
      req.set('Cookie', `dt=${deviceToken.token}; st=${sessionToken.token}`)

      const res = await req
        .post('/api/v1/auth/passkeys/authentication/options')
        .send({})
        .expect(200)

      const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined
      expect(maxAgeOf(cookieHeader, 'st')).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
      expect(maxAgeOf(cookieHeader, 'st')).not.toBe(SESSION_EXPIRATION_SECONDS)
    })

    it('preserves an edge-anon-issued attested device by minting a 30-day (not 2-day) st cookie', async () => {
      // Regression: deviceClass must come from getSessionTokenData() (which verifies
      // edge-anon-issued dt/st pairs), not getDeviceTokenData() (which only verifies
      // backend-issued dt tokens and silently drops dc for edge-anon devices).
      const req = createRequest()
      const did = v7()
      const sid = v7()
      const deviceToken = await signDeviceJwt(
        { did, dc: 'attested' },
        { issuer: EDGE_ANON_SESSION_JWT_ISSUER, expiresIn: '30 days' },
      )
      const sessionToken = await signSessionJwt(
        { did, sid, uid: null },
        { issuer: EDGE_ANON_SESSION_JWT_ISSUER, expiresIn: '2 days' },
      )
      req.set('Cookie', `dt=${deviceToken}; st=${sessionToken}`)

      const res = await req
        .post('/api/v1/auth/passkeys/authentication/options')
        .send({})
        .expect(200)

      const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined
      expect(maxAgeOf(cookieHeader, 'st')).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
      expect(maxAgeOf(cookieHeader, 'st')).not.toBe(SESSION_EXPIRATION_SECONDS)
    })
  })

  // ─── Authentication verify (no auth required) ─────────────────────────────

  describe('POST /api/v1/auth/passkeys/authentication/verify', () => {
    it('returns 415 for non-JSON content type', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 when response field is missing', async () => {
      const req = createRequest()
      const res = await req.post('/api/v1/auth/passkeys/authentication/verify').send({}).expect(422)

      expect(res.body.message).toContain('response is required')
    })

    it('returns 400 when no options were requested (challenge missing)', async () => {
      const req = await createAnonymousRequest()
      // Send a response without requesting options first — no challenge in Valkey
      const res = await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: { id: 'fake-cred-id' } })
        .expect(400)

      expect(res.body.message).toContain('challenge expired or not found')
    })

    it('returns 401 for unknown credential after requesting options', async () => {
      const req = await createAnonymousRequest()
      // Request options first to store a challenge keyed by this device's did
      await req.post('/api/v1/auth/passkeys/authentication/options').send({}).expect(200)

      // Verify with an unregistered credential id
      const res = await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: { id: 'nonexistent-credential-id' } })
        .expect(401)

      expect(res.body.message).toContain('Passkey sign-in failed')
    })

    it('does not set auth cookies when verification fails (unknown credential)', async () => {
      const req = await createAnonymousRequest()
      await req.post('/api/v1/auth/passkeys/authentication/options').send({}).expect(200)

      const res = await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: { id: 'nonexistent-cred' } })
        .expect(401)

      const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined
      const setsDt = cookieHeader?.some(c => c.startsWith('dt='))
      const setsSt = cookieHeader?.some(c => c.startsWith('st='))
      expect(setsDt).toBeFalsy()
      expect(setsSt).toBeFalsy()
    })

    it('does not create a user for unrecognised credentials (sign-in not sign-up)', async () => {
      // Regression: unknown credential must never provision an account
      const suffix = `no-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const req = await createAnonymousRequest()
      await req.post('/api/v1/auth/passkeys/authentication/options').send({}).expect(200)

      await req
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: { id: `novel-cred-${suffix}` } })
        .expect(401)
    })
  })
})
