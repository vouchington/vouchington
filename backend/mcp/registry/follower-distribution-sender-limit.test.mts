import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  countFollowerDistributionsForSenderForTest,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'

const CASES = [
  { tool: 'act_on_post', option: 'share', target: 'post', send: false },
  { tool: 'act_on_post', option: 'send', target: 'post', send: true },
  { tool: 'share_rss_feed_item', option: 'share', target: 'rss', send: false },
  { tool: 'share_rss_feed_item', option: 'send', target: 'rss', send: true },
] as const

describe('MCP and REST follower distribution sender budget', () => {
  let originalConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalConfig = routeRateLimitConfig.getFields()
  })

  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      follower_distribution_max_requests: 2,
      follower_distribution_window_seconds: 60,
    })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalConfig)
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it.each(CASES)('$tool $option charges once and shares the REST sender budget', async testCase => {
    const creator = await createTestUser()
    const sender = await createTestPlusMcpCaller()
    const otherSender = await createTestPlusMcpCaller()
    const restPost = await createTestPost({ user: creator, privacy: 'public' })
    const toolPost = await createTestPost({ user: creator, privacy: 'public' })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const request = createRequest()
    await request.authenticateAs(sender)
    await request.post(`/api/v1/posts/${restPost.id}/shares`).expect(202)

    const scopes =
      testCase.target === 'post'
        ? (['posts:read', 'posts:write'] as const)
        : (['rss-feed-items:read', 'rss-feed-items:write'] as const)
    const args = optionArgs(testCase.option, {
      ...(testCase.target === 'post' ? { id: toolPost.id } : { rss_feed_item_id: item.id }),
      ...(testCase.send ? { audience: 'all_followers' } : {}),
    })
    const accepted = await callStructuredMcpTool(sender, testCase.tool, args, scopes)
    expect(accepted).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(2)

    const limitedRest = await request
      .post(`/api/v1/posts/${restPost.id}/sends`)
      .send({ audience: 'all_followers' })
      .expect(429)
    expect(limitedRest.headers['retry-after']).toBe('60')
    const limitedTool = JSON.parse(await callRejectedMcpTool(sender, testCase.tool, args, scopes))
    expect(limitedTool).toMatchObject({
      error: { status: 429, code: 'RATE_LIMIT', retryable: true, retryAfterSeconds: 60 },
    })
    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(2)

    expect(await callStructuredMcpTool(otherSender, testCase.tool, args, scopes)).toMatchObject({
      status: 'accepted',
    })
    await expect(countFollowerDistributionsForSenderForTest(otherSender.id)).resolves.toBe(1)
  })
})
