import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { isIP } from 'node:net'
import {
  createRequest,
  formatTestRequestIp,
  nextTestRequestIp,
} from '@voucha/api/test-helpers/server'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestPost,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/reports rate limits', () => {
  let user: PrivateUser
  let postId: string
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields> | undefined
  let originalUserRateLimitConfig: ReturnType<typeof rateLimitConfig.getFields> | undefined
  const testRequestIpState = globalThis as typeof globalThis & {
    vouchaTestRequestIpCounter?: number
  }

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    await rateLimitConfig.waitForInitialization()
    // Keep local overrideDynamicConfigFieldsForTest() values from being replaced
    // by cross-fork DynamicConfig pub/sub messages during parallel backend runs.
    routeRateLimitConfig.unsubscribe()
    rateLimitConfig.unsubscribe()

    user = await createTestUser()
    postId = await insertTestPost({
      createdById: user.id,
      slug: `report-rate-limit-root-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Rate Limit Root API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test body',
    })
  })

  afterEach(async () => {
    if (originalRouteRateLimitConfig) {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
      originalRouteRateLimitConfig = undefined
    }
    if (originalUserRateLimitConfig) {
      overrideDynamicConfigFieldsForTest(rateLimitConfig, originalUserRateLimitConfig)
      originalUserRateLimitConfig = undefined
    }
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig, rateLimitConfig])
  })

  it('generates valid forwarded IPs for high CI process ids and counters', () => {
    const firstIp = formatTestRequestIp(0x123456, 0x10001)
    const secondIp = formatTestRequestIp(0x123456, 0x10002)

    expect(isIP(firstIp)).toBe(6)
    expect(isIP(secondIp)).toBe(6)
    expect(firstIp).not.toBe(secondIp)
  })

  it('continues generated forwarded IP counters from global worker state', () => {
    const originalCounter = testRequestIpState.vouchaTestRequestIpCounter
    try {
      testRequestIpState.vouchaTestRequestIpCounter = 0x10002
      expect(nextTestRequestIp()).toBe(formatTestRequestIp(process.pid, 0x10003))
    } finally {
      testRequestIpState.vouchaTestRequestIpCounter = originalCounter
    }
  })

  it('returns 429 with Retry-After when sensitive route rate limit is exceeded', async () => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    originalUserRateLimitConfig = rateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true, anon_sensitive: 3 })
    overrideDynamicConfigFieldsForTest(rateLimitConfig, {
      sensitive_tier0: 3,
      sensitive_tier1: 3,
      sensitive_tier2: 3,
      sensitive_tier3: 3,
      sensitive_tier4: 3,
      sensitive_tier5: 3,
    })

    const rateLimitReporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(rateLimitReporter)

    for (let i = 0; i < 2; i++) {
      const limitedPostId = await insertTestPost({
        createdById: user.id,
        slug: `report-rate-limit-api-${i}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Report Rate Limit API ${i} ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await request
        .post('/api/v1/reports')
        .set('Content-Type', 'application/json')
        .send({ entityType: 'post', entityId: limitedPostId, reason: 'spam' })
        .expect(201)
    }

    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(429)
    expect(response.headers['retry-after']).toBeDefined()
  }, 60_000)

  it('keeps default test agents in separate route-rate-limit IP buckets', async () => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    originalUserRateLimitConfig = rateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true, anon_sensitive: 2 })
    overrideDynamicConfigFieldsForTest(rateLimitConfig, {
      sensitive_tier0: 2,
      sensitive_tier1: 2,
      sensitive_tier2: 2,
      sensitive_tier3: 2,
      sensitive_tier4: 2,
      sensitive_tier5: 2,
    })

    const firstReporter = await createTestUser()
    const secondReporter = await createTestUser()
    const firstRequest = createRequest()
    const secondRequest = createRequest()
    await firstRequest.authenticateAs(firstReporter)
    await secondRequest.authenticateAs(secondReporter)

    await firstRequest
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(201)
    await secondRequest
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(201)
  }, 60_000)
})
