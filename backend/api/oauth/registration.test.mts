import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { deleteRouteRateLimitKeys } from '@services/route-rate-limits/test-support'

const SCOPE = 'mcp.user:read mcp.user:write'
let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

describe('OAuth dynamic client registration route', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })
  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('rejects unsafe dynamic registration metadata', async () => {
    await createRequest()
      .post('/register')
      .send({
        client_name: 'Unsafe IPv6 client',
        redirect_uris: ['http://[2001:db8::1]/callback'],
        scope: SCOPE,
      })
      .expect(400, {
        error: 'invalid_redirect_uri',
        error_description: 'redirect URIs must use HTTPS or loopback HTTP',
      })
    await createRequest()
      .post('/register')
      .send({
        client_name: 'Incomplete grant client',
        grant_types: ['authorization_code'],
        redirect_uris: [randomRedirectUri()],
        scope: SCOPE,
      })
      .expect(400, {
        error: 'invalid_client_metadata',
        error_description: 'grant_types is not supported',
      })
    await createRequest()
      .post('/register')
      .send({
        client_name: 'Wildcard redirect client',
        redirect_uris: ['https://*.example.com/callback'],
        scope: SCOPE,
      })
      .expect(400, {
        error: 'invalid_redirect_uri',
        error_description: 'redirect URIs cannot contain wildcards',
      })
    await createRequest()
      .post('/register')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400, {
        error: 'invalid_client_metadata',
        error_description: 'registration metadata must be a JSON object',
      })
    await createRequest()
      .post('/register')
      .send({
        client_name: 'Trusted client\u202eexe.txt',
        redirect_uris: [randomRedirectUri()],
        scope: SCOPE,
      })
      .expect(400, {
        error: 'invalid_client_metadata',
        error_description: 'client_name must contain between 1 and 120 characters',
      })
  })

  it('returns an RFC error and no-store headers for malformed JSON', async () => {
    const response = await createRequest()
      .post('/register')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400, {
        error: 'invalid_client_metadata',
        error_description: 'registration metadata must be valid JSON',
      })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('rate-limits public registration by stable source IP with standard headers', async () => {
    const ip = `2001:db8:ffff::${randomBytes(2).readUInt16BE(0).toString(16)}`
    const routeKey = 'POST:/register'
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_sensitive: 3,
      anon_sensitive_ttl: 60,
    })
    await deleteRouteRateLimitKeys(routeKey, { ip })
    const request = createRequest()
    request.set('x-forwarded-for', ip)
    try {
      const first = await request
        .post('/register')
        .send({
          client_name: 'Rate limited registration one',
          redirect_uris: [randomRedirectUri()],
          scope: SCOPE,
        })
        .expect(201)
      expect(first.headers['x-ratelimit-limit']).toBe('3')
      expect(first.headers['x-ratelimit-remaining']).toBe('2')
      await request
        .post('/register')
        .send({
          client_name: 'Rate limited registration two',
          redirect_uris: [randomRedirectUri()],
          scope: SCOPE,
        })
        .expect(201)
      const limited = await request
        .post('/register')
        .send({
          client_name: 'Rate limited registration three',
          redirect_uris: [randomRedirectUri()],
          scope: SCOPE,
        })
        .expect(429)
      expect(limited.headers['retry-after']).toBe('60')
      expect(limited.headers['x-ratelimit-remaining']).toBe('0')
    } finally {
      await deleteRouteRateLimitKeys(routeKey, { ip })
    }
  })
})

function randomRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
