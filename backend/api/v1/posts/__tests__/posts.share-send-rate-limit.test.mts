import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
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
import {
  getFollowerDistributionMaxRequests,
  getFollowerDistributionWindowSeconds,
  routeRateLimitConfig,
} from '@services/route-rate-limits/config'

describe('follower distribution sender route rate limit', () => {
  let originalConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalConfig = routeRateLimitConfig.getFields()
  })

  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      follower_distribution_max_requests: 4,
      follower_distribution_window_seconds: 60,
    })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalConfig)
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it('shares one sender budget across post and RSS shares and sends, without limiting another sender', async () => {
    const creator = await createTestUser()
    const firstSender = await createTestUser()
    const secondSender = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const firstRequest = createRequest()
    const secondRequest = createRequest()
    await firstRequest.authenticateAs(firstSender)
    await secondRequest.authenticateAs(secondSender)
    const sharedIp = nextTestRequestIp()
    firstRequest.set('x-forwarded-for', sharedIp)
    secondRequest.set('x-forwarded-for', sharedIp)
    const paths = [
      `/api/v1/posts/${post.id}/shares`,
      `/api/v1/posts/${post.id}/sends`,
      `/api/v1/rss-feed-items/${item.id}/shares`,
      `/api/v1/rss-feed-items/${item.id}/sends`,
    ]

    for (const path of paths) {
      const pending = firstRequest.post(path)
      if (path.endsWith('/sends')) pending.send({ audience: 'all_followers' })
      await pending.expect(202)
    }
    await expect(countFollowerDistributionsForSenderForTest(firstSender.id)).resolves.toBe(4)

    for (const path of paths) {
      const pending = firstRequest.post(path)
      if (path.endsWith('/sends')) pending.send({ audience: 'all_followers' })
      const response = await pending.expect(429)
      expect(response.headers['retry-after']).toBe('60')
      expect(response.body).toMatchObject({
        message: 'Rate limit exceeded. Please try again later.',
      })
    }
    await expect(countFollowerDistributionsForSenderForTest(firstSender.id)).resolves.toBe(4)

    for (const path of paths) {
      const pending = secondRequest.post(path)
      if (path.endsWith('/sends')) pending.send({ audience: 'all_followers' })
      await pending.expect(202)
    }
    await expect(countFollowerDistributionsForSenderForTest(secondSender.id)).resolves.toBe(4)
  })

  it('honors the global route-limit switch even when the sender budget is exhausted', async () => {
    const creator = await createTestUser()
    const sender = await createTestUser()
    const firstPost = await createTestPost({ user: creator, privacy: 'public' })
    const secondPost = await createTestPost({ user: creator, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      follower_distribution_max_requests: 1,
    })
    await request.post(`/api/v1/posts/${firstPost.id}/shares`).expect(202)
    const limited = await request.post(`/api/v1/posts/${secondPost.id}/shares`).expect(429)
    expect(limited.headers['retry-after']).toBe('60')

    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await request.post(`/api/v1/posts/${secondPost.id}/shares`).expect(202)
    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(2)
  })

  it('bounds runtime overrides and falls back to the sender burst defaults', () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      follower_distribution_max_requests: 100,
      follower_distribution_window_seconds: 3_600,
    })
    expect(getFollowerDistributionMaxRequests()).toBe(100)
    expect(getFollowerDistributionWindowSeconds()).toBe(3_600)
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      follower_distribution_max_requests: 101,
      follower_distribution_window_seconds: 3_601,
    })
    expect(getFollowerDistributionMaxRequests()).toBe(10)
    expect(getFollowerDistributionWindowSeconds()).toBe(60)
  })
})
