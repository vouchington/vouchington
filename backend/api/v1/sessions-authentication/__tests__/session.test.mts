import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createRequest, nextTestRequestIp } from '@voucha/api/test-helpers/server'

import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  isUUIDv7,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import {
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '@services/jwt-session/test-helpers/index'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

import { v7 } from 'uuid'

describe('Session Routes', () => {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
  }, 30_000)

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  describe('PATCH /api/v1/session', () => {
    it('should create new device and session tokens when none provided', async () => {
      const request = createRequest()
      const response = await request.patch('/api/v1/session').send({}).expect(200)

      expect(response.body.session).toHaveProperty('dt')
      expect(response.body.session).toHaveProperty('st')
      expect(response.body.session).toHaveProperty('did')
      expect(response.body.session).toHaveProperty('sid')
      expect(response.body.session).toHaveProperty('dte')
      expect(response.body.session).toHaveProperty('ste')
      expect(response.body.session.uid).toBeNull()
      expect(response.body.session.did).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should accept and validate existing device token', async () => {
      const request = createRequest()
      const did = v7()
      const { deviceToken } = await createDeviceAndSessionTokens({ did })

      const response = await request
        .patch('/api/v1/session')
        .send({ dt: deviceToken.token })
        .expect(200)

      expect(response.body.session.did).toBe(did)
      expect(response.body.session.dt).toBe(deviceToken.token)
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should rotate to a new anonymous session when only session token is provided', async () => {
      const request = createRequest()
      const did = v7()
      const sid = v7()
      const uid = v7()
      const { sessionToken } = await createDeviceAndSessionTokens({ did, sid, uid })

      const response = await request
        .patch('/api/v1/session')
        .send({ st: sessionToken.token })
        .expect(200)

      expect(response.body.session.did).not.toBe(did)
      expect(response.body.session.sid).not.toBe(sid)
      expect(response.body.session.st).not.toBe(sessionToken.token)
      expect(response.body.session.uid).toBeNull()
    })

    it('should accept both device and session tokens', async () => {
      const request = createRequest()
      const did = v7()
      const sid = v7()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, sid })

      const response = await request
        .patch('/api/v1/session')
        .send({
          dt: deviceToken.token,
          st: sessionToken.token,
        })
        .expect(200)

      expect(response.body.session.did).toBe(did)
      expect(response.body.session.sid).toBe(sid)
      expect(response.body.session.dt).toBe(deviceToken.token)
      expect(response.body.session.st).toBe(sessionToken.token)
    })

    it('should generate new tokens for invalid device token', async () => {
      const request = createRequest()
      const response = await request
        .patch('/api/v1/session')
        .send({ dt: 'invalid-token' })
        .expect(200)

      expect(response.body.session.dt).toBeDefined()
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.did).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should generate new tokens for invalid session token', async () => {
      const request = createRequest()
      const response = await request
        .patch('/api/v1/session')
        .send({ st: 'invalid-token' })
        .expect(200)

      expect(response.body.session.dt).toBeDefined()
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.did).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should return 415 for non-JSON Content-Type', async () => {
      const request = createRequest()
      // api-server rejects mutating requests with a non-JSON body before they reach the route, returning 415
      // "Unsupported Media Type" rather than a route-level 422.
      await request.patch('/api/v1/session').send('not json').expect(415)
    })

    it('should return 422 for invalid device token type', async () => {
      const request = createRequest()
      const response = await request.patch('/api/v1/session').send({ dt: 123 }).expect(422)

      expect(response.body.message).toContain('Invalid Device Token')
    })

    it('should return 422 for invalid session token type', async () => {
      const request = createRequest()
      const response = await request.patch('/api/v1/session').send({ st: 123 }).expect(422)

      expect(response.body.message).toContain('Invalid Session Token')
    })

    it('should create new session when device IDs do not match', async () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 10,
        anon_read_ttl: 60,
      })

      const request = createRequest()
      const did1 = v7()
      const did2 = v7()
      const { deviceToken } = await createDeviceAndSessionTokens({ did: did1 })
      const { sessionToken } = await createDeviceAndSessionTokens({ did: did2 })

      const response = await request
        .patch('/api/v1/session')
        .send({
          dt: deviceToken.token,
          st: sessionToken.token,
        })
        .expect(200)

      // Should use device token's did and create new session
      expect(response.body.session.did).toBe(did1)
      expect(response.body.session.dt).toBe(deviceToken.token)
      // Session should be new since device IDs don't match
      expect(response.body.session.st).not.toBe(sessionToken.token)
    })

    it('should return the attested session max-age for an attested device token', async () => {
      const request = createRequest()
      const did = v7()
      const { deviceToken } = await createDeviceAndSessionTokens({ did, deviceClass: 'attested' })

      const response = await request
        .patch('/api/v1/session')
        .send({ dt: deviceToken.token })
        .expect(200)

      expect(response.body.session.ste).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    })

    it('should return the default session max-age for a non-attested device token', async () => {
      const request = createRequest()
      const did = v7()
      const { deviceToken } = await createDeviceAndSessionTokens({ did })

      const response = await request
        .patch('/api/v1/session')
        .send({ dt: deviceToken.token })
        .expect(200)

      expect(response.body.session.ste).toBe(SESSION_EXPIRATION_SECONDS)
    })

    it('should rotate legacy anonymous dt/st ids to UUIDv7 before returning a session', async () => {
      const request = createRequest()
      const legacyDid = legacyUuidV4()
      const legacySid = legacyUuidV4()
      const deviceToken = await signLegacyDeviceJwt({ did: legacyDid })
      const sessionToken = await signLegacySessionJwt({ did: legacyDid, sid: legacySid, uid: null })

      const response = await request
        .patch('/api/v1/session')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(200)

      expect(isUUIDv7(response.body.session.did)).toBe(true)
      expect(isUUIDv7(response.body.session.sid)).toBe(true)
      expect(response.body.session.did).not.toBe(legacyDid)
      expect(response.body.session.sid).not.toBe(legacySid)
      expect(response.body.session.uid).toBeNull()
    })

    it('rate-limits the posted token pair instead of stale cookies', async () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 2,
        anon_read_ttl: 60,
      })

      const cookieTokens = await createDeviceAndSessionTokens({ did: v7() })
      const bodyTokenSets = await Promise.all([
        createDeviceAndSessionTokens({ did: v7() }),
        createDeviceAndSessionTokens({ did: v7() }),
        createDeviceAndSessionTokens({ did: v7() }),
      ])
      const cookieHeader = [
        `dt=${cookieTokens.deviceToken.token}`,
        `st=${cookieTokens.sessionToken.token}`,
      ].join('; ')
      const request = createRequest()

      for (const tokens of bodyTokenSets) {
        await request
          .patch('/api/v1/session')
          .set('x-forwarded-for', nextTestRequestIp())
          .set('Cookie', cookieHeader)
          .send({
            dt: tokens.deviceToken.token,
            st: tokens.sessionToken.token,
          })
          .expect(200)
      }
    })

    it('rate-limits malformed JSON before returning the parse error', async () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 1,
        anon_read_ttl: 60,
      })

      const request = createRequest()
      const ip = nextTestRequestIp()
      await request
        .patch('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('not valid json{')
        .expect(429)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof beforeEach)
})
