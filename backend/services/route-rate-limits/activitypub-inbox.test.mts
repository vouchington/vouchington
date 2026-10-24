import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { RateLimiter } from 'valkyries/rate-limiter'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import {
  isActivityPubInboxSenderRateLimited,
  normalizeActivityPubInboxSenderLimitResult,
  recordActivityPubInboxAttempt,
  recordActivityPubInboxSenderDelivery,
  recordActivityPubInboxSenderDeliveryOnce,
} from './activitypub-inbox.mts'
import { routeRateLimitConfig } from './config.mts'

function senderHostname(label: string): string {
  return `${label}-${randomUUID()}.example`
}

describe('ActivityPub inbox sender rate limit', () => {
  it.each([
    [0, false],
    [0n, false],
    [1, true],
    [1n, true],
  ] as const)('normalizes sender-limit script result %s to %s', (result, expected) => {
    expect(normalizeActivityPubInboxSenderLimitResult(result)).toBe(expected)
  })

  it('rejects an unexpected sender-limit script result', () => {
    expect(() => normalizeActivityPubInboxSenderLimitResult(2)).toThrow(
      'Unexpected ActivityPub inbox sender-limit result: 2',
    )
  })

  it('reports an attempt charge failure once and fails open', async () => {
    const error = new Error('Valkey unavailable')
    const ipParts = randomUUID().replaceAll('-', '').slice(8).match(/.{4}/g)
    if (!ipParts) throw new Error('Expected UUID address material')
    const sourceIp = `2001:db8:${ipParts.join(':')}`
    const originalAddAndCheck = RateLimiter.prototype.addAndCheck
    const addAndCheck = vi.spyOn(RateLimiter.prototype, 'addAndCheck').mockImplementation(function (
      this: RateLimiter,
      ids,
      threshold,
      ttlSeconds,
    ) {
      if (this.prefix === 'activitypub-inbox-attempt-ip' && ids.length === 1 && ids[0] === sourceIp)
        return Promise.reject(error)
      return originalAddAndCheck.call(this, ids, threshold, ttlSeconds)
    })
    try {
      const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
      await expect(recordActivityPubInboxAttempt(sourceIp)).resolves.toBe(false)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reported]) => reported === error),
      ).toHaveLength(1)
    } finally {
      addAndCheck.mockRestore()
    }
  })

  it('accepts the configured number of deliveries and rejects the next one', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 2,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const hostname = senderHostname('allowance')

    for (let request = 0; request < 2; request += 1) {
      expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(false)
    }

    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(false)
    expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(true)
    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(true)
  })

  it('keeps sender hostnames isolated', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const firstHostname = senderHostname('first')
    const secondHostname = senderHostname('second')

    expect(await recordActivityPubInboxSenderDelivery(firstHostname)).toBe(false)
    expect(await isActivityPubInboxSenderRateLimited(firstHostname)).toBe(false)
    expect(await recordActivityPubInboxSenderDelivery(firstHostname)).toBe(true)
    expect(await isActivityPubInboxSenderRateLimited(firstHostname)).toBe(true)
    expect(await isActivityPubInboxSenderRateLimited(secondHostname)).toBe(false)
    expect(await recordActivityPubInboxSenderDelivery(secondHostname)).toBe(false)
  })

  it('caches one admission decision per durable delivery across concurrent retries', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 2,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const hostname = senderHostname('durable-delivery')
    const allowedDeliveryId = randomUUID()
    const limitedDeliveryId = randomUUID()

    await expect(
      Promise.all([
        recordActivityPubInboxSenderDeliveryOnce(hostname, allowedDeliveryId),
        recordActivityPubInboxSenderDeliveryOnce(hostname, allowedDeliveryId),
      ]),
    ).resolves.toEqual([false, false])
    await expect(recordActivityPubInboxSenderDelivery(hostname)).resolves.toBe(false)
    await expect(
      recordActivityPubInboxSenderDeliveryOnce(hostname, limitedDeliveryId),
    ).resolves.toBe(true)
    await expect(
      recordActivityPubInboxSenderDeliveryOnce(hostname, allowedDeliveryId),
    ).resolves.toBe(false)
    await expect(
      recordActivityPubInboxSenderDeliveryOnce(hostname, limitedDeliveryId),
    ).resolves.toBe(true)
  })

  it('reports limiter failures and fails open for checks and charges', async () => {
    const error = new Error('Valkey unavailable')
    const hostname = senderHostname('failure')
    const originalIsRateLimited = RateLimiter.prototype.isRateLimited
    const originalAddAndCheck = RateLimiter.prototype.addAndCheck
    const isRateLimited = vi
      .spyOn(RateLimiter.prototype, 'isRateLimited')
      .mockImplementation(function (this: RateLimiter, ids, threshold, ttlSeconds) {
        if (this.prefix === 'activitypub-inbox-sender' && ids.length === 1 && ids[0] === hostname)
          return Promise.reject(error)
        return originalIsRateLimited.call(this, ids, threshold, ttlSeconds)
      })
    const addAndCheck = vi.spyOn(RateLimiter.prototype, 'addAndCheck').mockImplementation(function (
      this: RateLimiter,
      ids,
      threshold,
      ttlSeconds,
    ) {
      if (this.prefix === 'activitypub-inbox-sender' && ids.length === 1 && ids[0] === hostname)
        return Promise.reject(error)
      return originalAddAndCheck.call(this, ids, threshold, ttlSeconds)
    })
    try {
      const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
      await expect(isActivityPubInboxSenderRateLimited(hostname)).resolves.toBe(false)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reported]) => reported === error),
      ).toHaveLength(1)
      await expect(recordActivityPubInboxSenderDelivery(hostname)).resolves.toBe(false)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reported]) => reported === error),
      ).toHaveLength(2)
    } finally {
      addAndCheck.mockRestore()
      isRateLimited.mockRestore()
    }
  })
})
