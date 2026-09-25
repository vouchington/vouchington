import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
import { createTestUser, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import { issueTestOAuthTokens } from '@services/oauth-authorization-server/test-support'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
// POST:/api/v1/mcp multiplies the write threshold by 4, and a threshold of 4 admits three calls.
const ALLOWED_CALLS = 3

describe('POST /api/v1/mcp rate limits', () => {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>
  let originalUserRateLimitConfig: ReturnType<typeof rateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    await rateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
    rateLimitConfig.unsubscribe()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    originalUserRateLimitConfig = rateLimitConfig.getFields()
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
    overrideDynamicConfigFieldsForTest(rateLimitConfig, originalUserRateLimitConfig)
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig, rateLimitConfig])
  })

  it('returns 429 with Retry-After once an OAuth client exceeds the route limit', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(rateLimitConfig, {
      write_tier0: 1,
      write_tier1: 1,
      write_tier2: 1,
      write_tier3: 1,
      write_tier4: 1,
      write_tier5: 1,
      // Distinct from any fallback, so Retry-After must carry the configured window.
      write_ttl: 45,
    })
    const { access_token: accessToken } = await issueTestOAuthTokens(await createTestUser())
    const ip = nextTestRequestIp()
    const post = () =>
      createRequest()
        .post('/api/v1/mcp')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-forwarded-for', ip)
        .send(MCP_LIST_BODY)

    for (let call = 0; call < ALLOWED_CALLS; call++) await post().expect(200)
    const limited = await post().expect(429)

    expect(limited.headers['retry-after']).toBe('45')
  })
})
