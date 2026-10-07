import { beforeAll, describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createRandomString,
  createTestUser,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
import type { PrivateUser } from '@services/users/types'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { useRouteRateLimitConfigSnapshot } from '@voucha/test-helpers/api/route-rate-limit-config-snapshot'
import '../index.mts'

// Covers the path-contract validation on DELETE /api/v1/auth/oauth/:provider/connect (issue #1515).
// The route is protected: requireAuth() runs before the schema check, so an anonymous caller that
// probes an invalid :provider segment gets a bare 401, not the "Invalid OAuth provider" diagnostic.
// The path schema only declares a string, so the provider allow-list stays the handler's own 400.
describe('DELETE /api/v1/auth/oauth/:provider/connect - request contract validation', () => {
  let user: PrivateUser
  const providerUserId = `test-google-${createRandomString(10)}`

  beforeAll(async () => {
    user = await createTestUser()
    await insertTestOAuthAccount('google', providerUserId, `${providerUserId}@test.com`)
    await connectTestOAuthAccount('google', user.id, providerUserId)
  }, 15_000)

  it('returns a bare 401 without a provider diagnostic for an anonymous invalid provider', async () => {
    const response = await createRequest()
      .delete('/api/v1/auth/oauth/not-a-provider/connect')
      .expect(401)

    expect(response.body.message).toBe('Unauthorized')
  })

  it('returns 400 for an unknown provider without disconnecting the connected account', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.delete('/api/v1/auth/oauth/not-a-provider/connect').expect(400)
    expect(response.body.message).toBe('Invalid OAuth provider: not-a-provider')

    // The connected google account survives the rejected call and is still disconnectable.
    await request.delete('/api/v1/auth/oauth/google/connect').expect(204)
  })
})

describe('POST /api/v1/auth/oauth/:provider/continue - typed body', () => {
  useRouteRateLimitConfigSnapshot()

  it('charges the anonymous rate limiter before rejecting an unknown body field', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_sensitive: 2,
      anon_sensitive_ttl: 60,
    })
    const request = createRequest()
    const ip = nextTestRequestIp()
    const body = { credential: 'test', unexpected: true }
    const response = await request
      .post('/api/v1/auth/oauth/google/continue')
      .set('x-forwarded-for', ip)
      .send(body)
      .expect(422)
    expect(response.body.message).toBe('Invalid request body')
    await request
      .post('/api/v1/auth/oauth/google/continue')
      .set('x-forwarded-for', ip)
      .send(body)
      .expect(429)
  })

  it('keeps the logged-in early return without reading an invalid body', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    await request.post('/api/v1/auth/oauth/google/continue').send({ unexpected: true }).expect(200)
  })
})
