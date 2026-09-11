import crypto from 'node:crypto'
import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { afterEach, describe, expect, it } from 'vitest'
import {
  configureWebRiskStateForTest,
  isLocallyRateLimited,
  resetWebRiskStateForTest,
} from './state.mts'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'

describe('web-risk state', () => {
  afterEach(async () => {
    await resetWebRiskStateForTest()
  })

  it('isLocallyRateLimited records minute and month windows in one check', async () => {
    const { monthBucket } = configureWebRiskStateForTest()

    await expect(isLocallyRateLimited()).resolves.toBe(false)

    const minuteKey = getRateLimiterKey('web-risk-minute', monthBucket, 'global')
    const monthKey = getRateLimiterKey('web-risk-month', monthBucket)
    expect(getHashTag(minuteKey)).toBe(monthBucket)
    expect(getHashTag(monthKey)).toBe(monthBucket)
    await expect(getSetSize(minuteKey)).resolves.toBe(1)
    await expect(getSetSize(monthKey)).resolves.toBe(1)
  })

  it('isLocallyRateLimited does not increment month when the minute window blocks', async () => {
    const { monthBucket } = configureWebRiskStateForTest({
      minuteThreshold: 1,
      monthThreshold: 10,
    })

    await expect(isLocallyRateLimited()).resolves.toBe(true)

    await expect(
      getSetSize(getRateLimiterKey('web-risk-minute', monthBucket, 'global')),
    ).resolves.toBe(1)
    await expect(getSetSize(getRateLimiterKey('web-risk-month', monthBucket))).resolves.toBe(0)
  })

  it('isLocallyRateLimited does not append month members after the month window is capped', async () => {
    const { monthBucket } = configureWebRiskStateForTest({
      minuteThreshold: 100,
      monthThreshold: 2,
    })
    const monthKey = getRateLimiterKey('web-risk-month', monthBucket)

    await expect(isLocallyRateLimited()).resolves.toBe(false)
    await expect(getSetSize(monthKey)).resolves.toBe(1)

    await expect(isLocallyRateLimited()).resolves.toBe(true)
    await expect(getSetSize(monthKey)).resolves.toBe(2)

    await expect(isLocallyRateLimited()).resolves.toBe(true)
    await expect(getSetSize(monthKey)).resolves.toBe(2)
  })

  it('isLocallyRateLimited fails open when the library throws', async () => {
    configureWebRiskStateForTest()
    const original = RateLimiter.addAndCheckWindows
    RateLimiter.addAndCheckWindows = () =>
      Promise.reject(suppressedError('local limiter unavailable'))

    try {
      await expect(isLocallyRateLimited()).resolves.toBe(false)
    } finally {
      RateLimiter.addAndCheckWindows = original
    }
  })

  it('reset deletes only the active test scope and restores default configuration', async () => {
    const { monthBucket: scopeAMonthBucket } = configureWebRiskStateForTest({
      minuteThreshold: 1,
      monthThreshold: 1,
    })
    const { monthBucket: reconfiguredMonthBucket } = configureWebRiskStateForTest({
      minuteThreshold: 2,
      monthThreshold: 2,
    })
    expect(reconfiguredMonthBucket).toBe(scopeAMonthBucket)

    const scopeBMonthBucket = makeMonthBucket('neighbor')
    const scopeAKeys = getScopedStateKeys(scopeAMonthBucket)
    const scopeBKeys = getScopedStateKeys(scopeBMonthBucket)
    await seedScopedState(scopeAKeys)
    await seedScopedState(scopeBKeys)

    try {
      await resetWebRiskStateForTest()

      await expect(keysExist(scopeAKeys)).resolves.toEqual([0, 0, 0])
      await expect(keysExist(scopeBKeys)).resolves.toEqual([1, 1, 1])

      const { monthBucket: restoredMonthBucket } = configureWebRiskStateForTest()
      expect(restoredMonthBucket).not.toBe(scopeAMonthBucket)
      await expect(isLocallyRateLimited()).resolves.toBe(false)
    } finally {
      await resetWebRiskStateForTest()
      await rateLimiterValkeyClient.unlink(scopeBKeys)
    }
  })
})

async function getSetSize(key: string): Promise<number> {
  const result = await rateLimiterValkeyClient.customCommand(['ZCARD', key])
  return Number(result)
}

function getRateLimiterKey(prefix: string, hashTag: string, suffix?: string): string {
  return RateLimiter.getWindowKey({
    prefix,
    id: suffix ?? '',
    hashTag,
    ttlSeconds: 60,
    threshold: 1,
  })
}

function getHashTag(key: string): string {
  const match = key.match(/\{([^}]*)\}/)
  return match?.[1] ?? ''
}

function makeMonthBucket(label: string): string {
  return `test-${label}-${crypto.randomUUID()}`
}

function getScopedStateKeys(monthBucket: string): [string, string, string] {
  return [
    getRateLimiterKey('web-risk-minute', monthBucket, 'global'),
    getRateLimiterKey('web-risk-month', monthBucket),
    `web-risk:cooldown:{${monthBucket}}`,
  ]
}

async function seedScopedState(keys: readonly string[]): Promise<void> {
  const [minuteKey, monthKey, cooldownKey] = keys
  await Promise.all([
    rateLimiterValkeyClient.customCommand(['ZADD', minuteKey!, '1', crypto.randomUUID()]),
    rateLimiterValkeyClient.customCommand(['ZADD', monthKey!, '1', crypto.randomUUID()]),
    rateLimiterValkeyClient.set(cooldownKey!, '1'),
  ])
}

async function keysExist(keys: readonly string[]): Promise<number[]> {
  return Promise.all(keys.map(key => rateLimiterValkeyClient.exists([key])))
}
