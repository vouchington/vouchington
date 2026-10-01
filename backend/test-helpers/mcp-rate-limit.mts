/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside test files because jest/no-export forbids exporting them there, and oxfmt rewrites it() to test() here */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { createRequest, nextTestRequestIp } from './api/server.mts'
import { createTestUser, overrideDynamicConfigFieldsForTest } from './index.mts'
import { closeScopedDynamicConfigContext } from './dynamic-config.mts'
import { readTestMcpCallAuditEvents } from './entities/mcp-call-audit.mts'
import { routeRateLimitConfig } from '../services/route-rate-limits/config.mts'
import { rateLimitConfig } from '../services/user-rate-limits/config.mts'
import { issueTestOAuthTokens } from './services/oauth-authorization-server/test-support.mts'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
// Both MCP routes multiply the write threshold by 4, and a threshold of 4 admits three calls.
const ALLOWED_CALLS = 3

export function registerMcpRateLimitTests({
  route,
  administrator = false,
  tokenOptions,
}: {
  route: '/api/v1/mcp' | '/api/v1/admin/mcp'
  administrator?: boolean
  tokenOptions?: Parameters<typeof issueTestOAuthTokens>[1]
}) {
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

  test('returns 429 with Retry-After and audits the rate-limited call', async () => {
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
    const user = await createTestUser({ administrator })
    const { access_token: accessToken } = await issueTestOAuthTokens(user, tokenOptions)
    const ip = nextTestRequestIp()
    const post = () =>
      createRequest()
        .post(route)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-forwarded-for', ip)
        .send(MCP_LIST_BODY)

    for (let call = 0; call < ALLOWED_CALLS; call++) await post().expect(200)
    const limited = await post().expect(429)

    expect(limited.headers['retry-after']).toBe('45')
    const events = await readTestMcpCallAuditEvents(user.id)
    expect(events.map(event => event.outcome)).toEqual([
      ...Array.from({ length: ALLOWED_CALLS }, () => 'accepted'),
      'rate_limited',
    ])
    expect(events.at(-1)?.correlation_id).toBe(limited.headers['x-correlation-id'])
  })
}
