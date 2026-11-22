import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from 'valkyries/rate-limiter'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { checkFollowerDistributionSenderRateLimit } from './follower-distributions.mts'
import { routeRateLimitConfig } from './config.mts'

describe('follower distribution sender limiter outage', () => {
  let restoreConfig: () => void

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    restoreConfig = overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
  })

  afterAll(async () => {
    restoreConfig()
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it('reports the failed sender charge and admits the request', async () => {
    const failure = new Error('Valkey unavailable')
    const senderUserId = crypto.randomUUID()
    const originalAddAndCheck = RateLimiter.prototype.addAndCheck
    const addAndCheck = vi.spyOn(RateLimiter.prototype, 'addAndCheck').mockImplementation(function (
      this: RateLimiter,
      ids,
      threshold,
      ttlSeconds,
    ) {
      if (
        this.prefix === 'follower-distribution-sender' &&
        ids.length === 1 &&
        ids[0] === senderUserId
      )
        return Promise.reject(failure)
      return originalAddAndCheck.call(this, ids, threshold, ttlSeconds)
    })
    try {
      const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
      await expect(checkFollowerDistributionSenderRateLimit(senderUserId)).resolves.toEqual({
        limited: false,
        retryAfterSeconds: 0,
      })
      const reports = sentryCaptureExceptionMock.mock.calls
        .slice(reportsBefore)
        .filter(([reported]) => reported === failure)
      expect(reports).toHaveLength(1)
      expect(reports[0]![0]).toBeInstanceOf(Error)
      expect(reports[0]![0]).toHaveProperty('message', 'Valkey unavailable')
    } finally {
      addAndCheck.mockRestore()
    }
  })
})
