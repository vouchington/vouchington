import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'

import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'

import { createDeviceAndSessionTokens, isSessionRevoked } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { useRouteRateLimitConfigSnapshot } from '@voucha/test-helpers/api/route-rate-limit-config-snapshot'

// Covers the post-parse runtime request-contract validation added for issue #322. A JSON body
// that parses successfully but isn't a plain object with string dt/st (null, an array, a string,
// a non-string dt/st) must be rejected with a bounded 4xx rather than silently normalized to `{}`,
// and the route's rate limiter must still see the request before that rejection. See
// backend/services/runtime-request-validation for the shared registry these tests exercise.
describe('/api/v1/session - request contract validation', () => {
  useRouteRateLimitConfigSnapshot()

  describe.each([
    {
      method: 'patch' as const,
      rateLimitKey: 'anon_read' as const,
      ttlKey: 'anon_read_ttl' as const,
    },
    {
      method: 'delete' as const,
      rateLimitKey: 'anon_write' as const,
      ttlKey: 'anon_write_ttl' as const,
    },
  ])('$method /api/v1/session', ({ method, rateLimitKey, ttlKey }) => {
    it.each([
      { shape: 'array' as const, body: '[]' },
      { shape: 'string' as const, body: '"x"' },
    ])('returns 422 for a JSON $shape body', async ({ body }) => {
      const req = createRequest()
      const response = await req[method]('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(422)

      expect(response.body.session).toBeUndefined()
    })

    it('rate-limits a non-object body before returning the contract error', async () => {
      // threshold N allows exactly N-1 calls before the limiter blocks (`count >= threshold`),
      // so a limit of 2 lets the first malformed request reach the 422 and blocks the second.
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        [rateLimitKey]: 2,
        [ttlKey]: 60,
      })

      const request = createRequest()
      const ip = nextTestRequestIp()
      await request[method]('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('[]')
        .expect(422)
      await request[method]('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('[]')
        .expect(429)
    })
  })

  describe('DELETE /api/v1/session', () => {
    it.each([
      { field: 'device token' as const, body: { dt: 123 } },
      { field: 'session token' as const, body: { st: 123 } },
    ])('returns 422 for a non-string $field', async ({ body }) => {
      const response = await createRequest()
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(422)

      expect(response.body.session).toBeUndefined()
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
