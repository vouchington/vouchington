import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { v7 } from 'uuid'

import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'

import { createDeviceAndSessionTokens, isSessionRevoked } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

// Covers the post-parse runtime request-contract validation added for issue #322. A JSON body
// that parses successfully but isn't a plain object with string dt/st (null, an array, a string,
// a non-string dt/st) must be rejected with a bounded 4xx rather than silently normalized to `{}`,
// and the route's rate limiter must still see the request before that rejection. See
// backend/services/runtime-request-validation for the shared registry these tests exercise.
describe('/api/v1/session - request contract validation', () => {
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
    it('returns 422 for a JSON array body', async () => {
      const response = await createRequest()
        .patch('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send('[]')
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('returns 422 for a JSON string body', async () => {
      const response = await createRequest()
        .patch('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send('"x"')
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('rate-limits a non-object body before returning the contract error', async () => {
      // threshold N allows exactly N-1 calls before the limiter blocks (`count >= threshold`),
      // so anon_read: 2 lets the first malformed request reach the 422 and blocks the second.
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 2,
        anon_read_ttl: 60,
      })

      const request = createRequest()
      const ip = nextTestRequestIp()
      await request
        .patch('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('[]')
        .expect(422)
      await request
        .patch('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('[]')
        .expect(429)
    })
  })

  describe('DELETE /api/v1/session', () => {
    it('returns 422 for a JSON array body', async () => {
      const response = await createRequest()
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send('[]')
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('returns 422 for a JSON string body', async () => {
      const response = await createRequest()
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send('"x"')
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('returns 422 for a non-string device token', async () => {
      const response = await createRequest()
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send({ dt: 123 })
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('returns 422 for a non-string session token', async () => {
      const response = await createRequest()
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send({ st: 123 })
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('rate-limits a non-object body before returning the contract error', async () => {
      // threshold N allows exactly N-1 calls before the limiter blocks (`count >= threshold`),
      // so anon_write: 2 lets the first malformed request reach the 422 and blocks the second.
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 2,
        anon_write_ttl: 60,
      })

      const request = createRequest()
      const ip = nextTestRequestIp()
      await request
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('[]')
        .expect(422)
      await request
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('[]')
        .expect(429)
    })

    it('rejects an unknown body field and never calls the reset service', async () => {
      // A uid-bearing dt/st pair makes resetSessionState revoke the old sid as a side effect
      // (see reset-session.mts) -- proving the sid stays unrevoked shows the 422 from the
      // unknown `foo` field short-circuited before the service ran, not just that the HTTP
      // response was a 422.
      const authenticatedSid = v7()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did: v7(),
        sid: authenticatedSid,
        uid: v7(),
      })

      const response = await createRequest()
        .delete('/api/v1/session')
        .send({ dt: deviceToken.token, st: sessionToken.token, foo: 'bar' })
        .expect(422)

      expect(response.body.session).toBeUndefined()
      expect(await isSessionRevoked(authenticatedSid)).toBe(false)
    })
  })
})
