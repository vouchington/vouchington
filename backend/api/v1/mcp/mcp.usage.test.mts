import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { settleMeteredMcpResponses } from '@voucha/test-helpers/mcp-usage-meter'
import { listUserOAuthGrants } from '@services/oauth-authorization-server'
import {
  routeRateLimitConfig,
  selectUsageQuota,
  settleUsage,
  type UsageIdentity,
} from '@services/route-rate-limits'
import { createTestMembership, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import {
  readAnonymousApiUsageRows,
  readApiUsageRows,
  startLocalAnalyticsForTest,
} from '@voucha/test-helpers/api-usage-analytics'
import { createRequest } from '@voucha/test-helpers/api/server'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { issueTestUserMcpCredential } from '@voucha/test-helpers/mcp-user-credentials'
import { rateLimitConfig } from '@services/user-rate-limits/config'

const LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
const READ_SCOPE = 'mcp.user:read'
const WRITE_SCOPE = 'mcp.user:read mcp.user:write'

function postMcp(token: string, body: string | object = LIST_BODY) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

async function usageQuotaKeys(): Promise<string[]> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, page] = await rateLimiterValkeyClient.scan(cursor, {
      match: 'rate-limiter:usage-quota:*',
      count: 1000,
    })
    cursor = String(next)
    keys.push(...page.map(String))
  } while (cursor !== '0')
  return keys
}

describe('POST /api/v1/mcp usage metering', () => {
  let stopLocalAnalytics: () => Promise<void>
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>
  let originalUserRateLimitConfig: ReturnType<typeof rateLimitConfig.getFields>

  beforeAll(async () => {
    stopLocalAnalytics = await startLocalAnalyticsForTest('mcp-usage-test-')
    await routeRateLimitConfig.waitForInitialization()
    await rateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
    rateLimitConfig.unsubscribe()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    originalUserRateLimitConfig = rateLimitConfig.getFields()
  })

  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
    overrideDynamicConfigFieldsForTest(rateLimitConfig, originalUserRateLimitConfig)
  })

  afterAll(async () => {
    await stopLocalAnalytics()
    await closeScopedDynamicConfigContext([routeRateLimitConfig, rateLimitConfig])
  })

  it('settles an in-band refused HTTP 200 with a zero-unit usage event', async () => {
    const userId = crypto.randomUUID()
    await settleUsage({
      surface: 'mcp_user',
      identity: { credential: 'session', userId },
      plan: 'free',
      scopeClass: 'read',
      quota: { limit: 1, windowSeconds: 900 },
      statusCode: 200,
      durationMs: 1,
      units: 0,
    })
    const [row, ...rest] = await readApiUsageRows(userId)
    expect(rest).toEqual([])
    expect(Number(row!.units)).toBe(0)
    expect(row!.status_code).toBe(200)
  })

  it('attributes an API key request to its key id and never stores the key', async () => {
    const { user, token, identity } = await issueTestUserMcpCredential('api_key', READ_SCOPE)

    await settleMeteredMcpResponses(() => postMcp(token).expect(200))

    const [row, ...rest] = await readApiUsageRows(user.id)
    expect(rest).toEqual([])
    expect(row).toMatchObject({
      surface: 'mcp_user',
      credential: 'api_key',
      user_id: user.id,
      api_key_id: identity.api_key_id,
      plan: 'free',
      scope_class: 'read',
      unit: 'request',
      status_code: 200,
    })
    expect(Number(row!.units)).toBe(1)
    expect(row!.oauth_client_id ?? null).toBeNull()
    expect(JSON.stringify(row)).not.toContain(token)
    const keys = await usageQuotaKeys()
    expect(keys.some(key => key.includes(user.id))).toBe(true)
    expect(keys.filter(key => key.includes(token))).toEqual([])
  })

  it('is not metered a second time by the REST usage meter', async () => {
    const { user, token } = await issueTestUserMcpCredential('api_key', READ_SCOPE)

    await settleMeteredMcpResponses(() => postMcp(token).expect(200))

    // The REST meter would settle first, as an anonymous row, because a bearer has no session.
    const [row, ...rest] = await readApiUsageRows(user.id)
    expect(rest).toEqual([])
    expect(row).toMatchObject({ surface: 'mcp_user', credential: 'api_key' })
    expect(await readAnonymousApiUsageRows()).toEqual([])
  })

  it('attributes an OAuth request to its client and grant and never stores the token', async () => {
    const { user, token, identity } = await issueTestUserMcpCredential('oauth', WRITE_SCOPE)
    const grants = await listUserOAuthGrants(user.id, { limit: 100 })
    const grant = grants.results.find(entry => entry.client.client_id === identity.oauth_client_id)

    await settleMeteredMcpResponses(() => postMcp(token).expect(200))

    const [row] = await readApiUsageRows(user.id)
    expect(row).toMatchObject({
      credential: 'oauth',
      user_id: user.id,
      oauth_client_id: identity.oauth_client_id,
      oauth_grant_id: grant!.id,
      scope_class: 'write',
    })
    expect(row!.api_key_id ?? null).toBeNull()
    expect(JSON.stringify(row)).not.toContain(token)
    expect((await usageQuotaKeys()).filter(key => key.includes(token))).toEqual([])
  })

  it('selects the quota from the scope class and the membership plan', async () => {
    const reader = await issueTestUserMcpCredential('api_key', READ_SCOPE)
    const writer = await issueTestUserMcpCredential('oauth', WRITE_SCOPE)
    const member = await issueTestUserMcpCredential('api_key', READ_SCOPE)
    await createTestMembership({ user_id: member.user.id, plan: 'plus' })

    await settleMeteredMcpResponses(async () => {
      await postMcp(reader.token).expect(200)
      await postMcp(writer.token).expect(200)
      await postMcp(member.token).expect(200)
    })

    const [readRow] = await readApiUsageRows(reader.user.id)
    const [writeRow] = await readApiUsageRows(writer.user.id)
    const [plusRow] = await readApiUsageRows(member.user.id)
    const quota = (plan: 'free' | 'plus', scopeClass: 'read' | 'write') =>
      selectUsageQuota({ surface: 'mcp_user', plan, scopeClass }).limit
    expect(Number(readRow!.quota_limit)).toBe(quota('free', 'read'))
    expect(Number(writeRow!.quota_limit)).toBe(quota('free', 'write'))
    expect(Number(plusRow!.quota_limit)).toBe(quota('plus', 'read'))
    expect(plusRow).toMatchObject({ plan: 'plus', scope_class: 'read' })
    expect(quota('free', 'write')).toBeLessThan(quota('free', 'read'))
    expect(quota('plus', 'read')).toBeGreaterThan(quota('free', 'read'))
  })

  it('charges a served 4xx to the quota', async () => {
    const { user, token } = await issueTestUserMcpCredential('api_key', READ_SCOPE)

    await settleMeteredMcpResponses(() => postMcp(token, '{ not json').expect(400))

    const [row] = await readApiUsageRows(user.id)
    expect(row).toMatchObject({ status_code: 400 })
    expect(Number(row!.units)).toBe(1)
  })

  it('refuses with an authoritative Retry-After once the quota is spent, without charging it', async () => {
    const { user, token, identity } = await issueTestUserMcpCredential('oauth', WRITE_SCOPE)
    const quota = selectUsageQuota({ surface: 'mcp_user', plan: 'free', scopeClass: 'write' })
    const served: UsageIdentity = {
      credential: 'oauth',
      userId: user.id,
      oauthClientId: identity.oauth_client_id!,
      oauthGrantId: 'prefill-grant',
    }
    for (let charged = 0; charged < quota.limit; charged += 50) {
      await Promise.all(
        Array.from({ length: Math.min(50, quota.limit - charged) }, () =>
          settleUsage({
            surface: 'mcp_user',
            identity: served,
            plan: 'free',
            scopeClass: 'write',
            quota,
            statusCode: 200,
            durationMs: 1,
          }),
        ),
      )
    }

    const limited = await settleMeteredMcpResponses(() => postMcp(token).expect(429))

    expect(limited.headers['retry-after']).toBe(String(quota.windowSeconds))
    const audit = await readTestMcpCallAuditEvents(user.id)
    expect(audit.map(event => event.outcome)).toEqual(['rate_limited'])
    const rows = await readApiUsageRows(user.id)
    expect(rows).toHaveLength(quota.limit + 1)
    expect(rows.at(-1)).toMatchObject({ status_code: 429 })
    expect(rows.reduce((units, row) => units + Number(row.units), 0)).toBe(quota.limit)
    // A different user keeps a full allowance.
    const other = await issueTestUserMcpCredential('oauth', WRITE_SCOPE)
    await postMcp(other.token).expect(200)
  })
})
