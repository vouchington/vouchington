import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  isActivityPubInboxAttemptRateLimited,
  isActivityPubInboxSenderRateLimited,
  normalizeActivityPubInboxSenderLimitResult,
  recordActivityPubInboxAttempt,
  recordActivityPubInboxSenderDelivery,
  recordActivityPubInboxSenderDeliveryOnce,
  type ActivityPubInboxRateLimitDependencies,
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

  it('reports attempt limiter failures and fails open for checks and charges', async () => {
    const error = new Error('Valkey unavailable')
    const reportError = vi.fn<(error: Error) => void>()
    const dependencies = {
      limiter: {
        isRateLimited: vi
          .fn<ActivityPubInboxRateLimitDependencies['limiter']['isRateLimited']>()
          .mockRejectedValue(error),
        addAndCheck: vi
          .fn<ActivityPubInboxRateLimitDependencies['limiter']['addAndCheck']>()
          .mockRejectedValue(error),
      },
      reportError,
    } as unknown as ActivityPubInboxRateLimitDependencies

    await expect(isActivityPubInboxAttemptRateLimited('192.0.2.1', dependencies)).resolves.toBe(
      false,
    )
    await expect(recordActivityPubInboxAttempt('192.0.2.1', dependencies)).resolves.toBe(false)
    expect(reportError).toHaveBeenCalledTimes(2)
    expect(reportError).toHaveBeenNthCalledWith(1, error)
    expect(reportError).toHaveBeenNthCalledWith(2, error)
  })

  it('accepts the configured number of deliveries and rejects the next one', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      activitypub_inbox_max_requests: 60,
      activitypub_inbox_window_seconds: 60,
    })
    const hostname = senderHostname('allowance')

    for (let request = 0; request < 60; request += 1) {
      expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(false)
    }

    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(false)
    expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(true)
    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(true)
  })

  it('keeps sender hostnames isolated', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      activitypub_inbox_max_requests: 1,
      activitypub_inbox_window_seconds: 60,
    })
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
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      activitypub_inbox_max_requests: 2,
      activitypub_inbox_window_seconds: 60,
    })
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
    const reportError = vi.fn<(error: Error) => void>()
    const dependencies = {
      limiter: {
        isRateLimited: vi
          .fn<ActivityPubInboxRateLimitDependencies['limiter']['isRateLimited']>()
          .mockRejectedValue(error),
        addAndCheck: vi
          .fn<ActivityPubInboxRateLimitDependencies['limiter']['addAndCheck']>()
          .mockRejectedValue(error),
      },
      reportError,
    } as unknown as ActivityPubInboxRateLimitDependencies

    await expect(isActivityPubInboxSenderRateLimited('sender.example', dependencies)).resolves.toBe(
      false,
    )
    await expect(
      recordActivityPubInboxSenderDelivery('sender.example', dependencies),
    ).resolves.toBe(false)
    expect(reportError).toHaveBeenCalledTimes(2)
    expect(reportError).toHaveBeenNthCalledWith(1, error)
    expect(reportError).toHaveBeenNthCalledWith(2, error)
  })
})
