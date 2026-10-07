import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiKey } from '@services/api-keys'
import { checkUsageQuota } from '@services/route-rate-limits'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import type { PrivateUser } from '@services/users/types'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import {
  createRandomString,
  createTestPost,
  createTestUser,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { settleMeteredMcpResponses } from '@voucha/test-helpers/mcp-usage-meter'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { countTestModerationReportsByReporter } from '@voucha/test-helpers/mcp-write-tool-rows'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

type ToolResponse = {
  id: number
  result: { isError?: boolean; content: Array<{ text: string }>; structuredContent?: unknown }
}

// `POST /api/v1/reports` is a sensitive route with a one-hour window, so a limited call waits it out.
const REPORT_WINDOW_SECONDS = 3600
const REFUSAL = {
  status: 429,
  code: 'RATE_LIMIT',
  message: 'Rate limit exceeded. Please try again later.',
  retryable: true,
  retryAfterSeconds: REPORT_WINDOW_SECONDS,
}

describe('MCP tool calls and their REST route rate limit', () => {
  let original: {
    route: ReturnType<typeof routeRateLimitConfig.getFields>
    user: ReturnType<typeof rateLimitConfig.getFields>
  }
  let author: PrivateUser

  // A sensitive route's threshold of N admits N - 1 calls in the window.
  function admitSensitiveCalls(admitted: number) {
    const threshold = admitted + 1
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_sensitive: threshold,
    })
    overrideDynamicConfigFieldsForTest(rateLimitConfig, {
      sensitive_tier0: threshold,
      sensitive_tier1: threshold,
      sensitive_tier2: threshold,
      sensitive_tier3: threshold,
      sensitive_tier4: threshold,
      sensitive_tier5: threshold,
    })
  }

  const newPostId = async () => (await createTestPost({ user: author }))!.id

  const mcpPost = (token: string, body: unknown) =>
    createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object)

  const toolCall = (id: number, name: string, args: Record<string, unknown>) => ({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  })

  const reportCall = (id: number, entityId: string) =>
    toolCall(id, 'create_content_report', {
      idempotency_key: crypto.randomUUID(),
      entity_type: 'post',
      entity_id: entityId,
      reason: 'spam',
    })

  async function reportOverMcp(token: string, entityId: string): Promise<ToolResponse> {
    const response = await mcpPost(token, reportCall(1, entityId)).expect(200)
    return response.body as ToolResponse
  }

  const reportOverRest = (rest: ReturnType<typeof createRequest>, entityId: string) =>
    rest
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId, reason: 'spam' })

  const refusalOf = (response: ToolResponse) => {
    expect(response.result.isError).toBe(true)
    return (JSON.parse(response.result.content[0]!.text) as { error: unknown }).error
  }

  async function callerWithToken() {
    const user = await createTestPlusMcpCaller()
    return { user, token: (await issueTestOAuthTokens(user)).access_token }
  }

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    await rateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
    rateLimitConfig.unsubscribe()
    original = { route: routeRateLimitConfig.getFields(), user: rateLimitConfig.getFields() }
    author = await createTestUser()
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, original.route)
    overrideDynamicConfigFieldsForTest(rateLimitConfig, original.user)
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig, rateLimitConfig])
  })

  it.each([
    ['REST, MCP, then REST', ['rest', 'mcp', 'rest']],
    ['MCP, MCP, then REST', ['mcp', 'mcp', 'rest']],
  ] as const)(
    'shares one report budget between both protocols (%s)',
    async (_order, calls) => {
      admitSensitiveCalls(3)
      const { user, token } = await callerWithToken()
      const rest = createRequest()
      await rest.authenticateAs(user)

      const admitted = async (protocol: 'rest' | 'mcp') => {
        const entityId = await newPostId()
        if (protocol === 'rest') return (await reportOverRest(rest, entityId)).status === 201
        return (await reportOverMcp(token, entityId)).result.isError === undefined
      }
      for (const protocol of calls) expect(await admitted(protocol)).toBe(true)

      const limitedRest = await reportOverRest(rest, await newPostId()).expect(429)
      const limitedMcp = await reportOverMcp(token, await newPostId())
      expect(limitedRest.headers['retry-after']).toBe(String(REPORT_WINDOW_SECONDS))
      expect(refusalOf(limitedMcp)).toEqual(REFUSAL)
      // The refused calls never ran, so only the three admitted reports exist.
      expect(await countTestModerationReportsByReporter(user.id)).toBe(3)
      const reportEvents = (await readTestMcpCallAuditEvents(user.id)).filter(
        event => event.tool_name === 'create_content_report',
      )
      expect(reportEvents.map(event => event.outcome)).toEqual([
        ...calls.filter(protocol => protocol === 'mcp').map(() => 'accepted'),
        'rate_limited',
      ])
    },
    60_000,
  )

  it('charges every call of a JSON-RPC batch, not the HTTP request', async () => {
    admitSensitiveCalls(4)
    const { user, token } = await callerWithToken()
    const rest = createRequest()
    await rest.authenticateAs(user)
    const postIds = [await newPostId(), await newPostId(), await newPostId()]

    const response = await mcpPost(
      token,
      postIds.map((postId, index) => reportCall(index + 1, postId)),
    ).expect(200)

    const results = response.body as ToolResponse[]
    expect(results.map(result => result.result.isError)).toEqual([undefined, undefined, undefined])
    // Three of the four admitted calls are spent, so exactly one more report is admitted.
    await reportOverRest(rest, await newPostId()).expect(201)
    await reportOverRest(rest, await newPostId()).expect(429)
  }, 60_000)

  it('refuses only the calls of a batch that exceed the budget', async () => {
    admitSensitiveCalls(2)
    const { user, token } = await callerWithToken()
    const postIds = [await newPostId(), await newPostId(), await newPostId()]

    const response = await mcpPost(
      token,
      postIds.map((postId, index) => reportCall(index + 1, postId)),
    ).expect(200)

    const byId = new Map((response.body as ToolResponse[]).map(result => [result.id, result]))
    expect(byId.get(1)?.result.isError).toBeUndefined()
    expect(byId.get(2)?.result.isError).toBeUndefined()
    expect(refusalOf(byId.get(3)!)).toEqual(REFUSAL)
    expect(await countTestModerationReportsByReporter(user.id)).toBe(2)
    // A refused call is audited once, as rate limited, and not again as a tool error.
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
      'accepted',
      'rate_limited',
    ])
  }, 60_000)

  it('does not charge usage quota when its only call is refused', async () => {
    admitSensitiveCalls(0)
    const { user, token } = await callerWithToken()
    const postId = await newPostId()
    expect(refusalOf(await settleMeteredMcpResponses(() => reportOverMcp(token, postId)))).toEqual(
      REFUSAL,
    )
    expect(
      (await checkUsageQuota('mcp_user', user.id, { limit: 1, windowSeconds: 900 })).limited,
    ).toBe(false)
  }, 60_000)

  it('charges one usage unit for a batch with a refused and an admitted call', async () => {
    admitSensitiveCalls(1)
    const { user, token } = await callerWithToken()
    const body = [reportCall(1, await newPostId()), reportCall(2, await newPostId())]
    const response = await settleMeteredMcpResponses(() => mcpPost(token, body).expect(200))
    const results = response.body as ToolResponse[]
    expect(results[0]?.result.isError).toBeUndefined()
    expect(refusalOf(results[1]!)).toEqual(REFUSAL)
    expect(
      (await checkUsageQuota('mcp_user', user.id, { limit: 1, windowSeconds: 900 })).limited,
    ).toBe(true)
    expect(
      (await checkUsageQuota('mcp_user', user.id, { limit: 2, windowSeconds: 900 })).limited,
    ).toBe(false)
  }, 60_000)

  it('leaves a tool without a REST twin on the transport bucket alone', async () => {
    admitSensitiveCalls(0)
    const { user, token } = await callerWithToken()
    // A topic made for this test keeps the read independent of rows other tests leave behind.
    const suffix = createRandomString(8).toLowerCase()
    const topicId = await insertTestTopic({
      name: `Route limit topic ${suffix}`,
      slug: `route-limit-topic-${suffix}`,
      createdById: user.id,
    })

    const response = await mcpPost(token, [
      toolCall(1, 'get_topic_metrics', { topic_id: topicId }),
      reportCall(2, await newPostId()),
    ]).expect(200)

    const byId = new Map((response.body as ToolResponse[]).map(result => [result.id, result]))
    expect(byId.get(1)?.result.isError).toBeUndefined()
    expect(refusalOf(byId.get(2)!)).toEqual(REFUSAL)
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
      'rate_limited',
    ])
  }, 60_000)

  it('charges the calls of an API key to the key own budget', async () => {
    admitSensitiveCalls(2)
    const user = await createTestPlusMcpCaller()
    const { rawKey } = await createApiKey(user.id, 'mcp', `Route limits ${createRandomString(6)}`, [
      'reports:write',
    ])

    expect((await reportOverMcp(rawKey, await newPostId())).result.isError).toBeUndefined()
    expect((await reportOverMcp(rawKey, await newPostId())).result.isError).toBeUndefined()
    expect(refusalOf(await reportOverMcp(rawKey, await newPostId()))).toEqual(REFUSAL)
    expect(await countTestModerationReportsByReporter(user.id)).toBe(2)
  }, 60_000)

  it('charges no route for a call that is refused before it runs', async () => {
    admitSensitiveCalls(1)
    const { user, token } = await callerWithToken()

    const invalid = await mcpPost(token, toolCall(1, 'create_content_report', { reason: 'spam' }))
    const notification = { jsonrpc: '2.0', method: 'tools/call', params: { name: 'ping' } }
    await mcpPost(token, notification)
    expect(invalid.status).toBe(200)

    // The single admitted call is still unspent after an invalid call and a notification.
    expect((await reportOverMcp(token, await newPostId())).result.isError).toBeUndefined()
    expect(refusalOf(await reportOverMcp(token, await newPostId()))).toEqual(REFUSAL)
    expect(await countTestModerationReportsByReporter(user.id)).toBe(1)
  }, 60_000)
})
