import { describe, expect, it } from 'vitest'
import {
  getDomainRateLimitRemainingMs,
  IMMEDIATE_RETRY_RATE_LIMIT_MS,
  normalizeDomainRateLimitMs,
  normalizeDomainRateLimitScriptResult,
  setDomainRateLimited,
  setDomainRateLimitedBackground,
} from './domain-rate-limit.mts'
import { pollUntilNotNull } from '@voucha/test-helpers/polling'

describe('domain-rate-limit', () => {
  it('normalizes retry-after values before writing Valkey locks', () => {
    expect(normalizeDomainRateLimitMs()).toBe(60_000)
    expect(normalizeDomainRateLimitMs(0)).toBe(IMMEDIATE_RETRY_RATE_LIMIT_MS)
    expect(normalizeDomainRateLimitMs(-1)).toBe(IMMEDIATE_RETRY_RATE_LIMIT_MS)
    expect(normalizeDomainRateLimitMs(2_500)).toBe(2_500)
  })

  it('normalizes Valkey script results before returning lock durations', () => {
    expect(normalizeDomainRateLimitScriptResult(2_500)).toBe(2_500)
    expect(normalizeDomainRateLimitScriptResult(2_500n)).toBe(2_500)
    expect(normalizeDomainRateLimitScriptResult({ toString: () => '2500' })).toBe(2_500)
    expect(() => normalizeDomainRateLimitScriptResult({ toString: () => 'not-a-number' })).toThrow(
      'set-domain-rate-limit returned invalid TTL: not-a-number',
    )
  })

  it('returns null when key does not exist', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    const result = await getDomainRateLimitRemainingMs(hostnameId)
    expect(result).toBeNull()
  })

  it('returns positive remaining ms after setting rate limit', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    setDomainRateLimitedBackground(hostnameId, 10_000)
    const result = await pollUntilNotNull(() => getDomainRateLimitRemainingMs(hostnameId))
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(10_000)
  })

  it('sets a brief lock when retryAfterMs is 0', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    const lockMs = await setDomainRateLimited(hostnameId, 0)
    const result = await getDomainRateLimitRemainingMs(hostnameId)
    expect(lockMs).toBe(IMMEDIATE_RETRY_RATE_LIMIT_MS)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(IMMEDIATE_RETRY_RATE_LIMIT_MS)
  })

  it('uses default 60s TTL when no retryAfterMs provided', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    setDomainRateLimitedBackground(hostnameId)
    const result = await pollUntilNotNull(() => getDomainRateLimitRemainingMs(hostnameId))
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(60_000)
  })

  it('does not shorten an existing longer lock', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    await setDomainRateLimited(hostnameId, 10_000)

    const lockMs = await setDomainRateLimited(hostnameId, 1_000)
    const result = await getDomainRateLimitRemainingMs(hostnameId)

    expect(lockMs).toBeGreaterThan(1_000)
    expect(result).toBeGreaterThan(1_000)
    expect(result).toBeLessThanOrEqual(10_000)
  })

  it('extends an existing shorter lock', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    await setDomainRateLimited(hostnameId, 1_000)

    const lockMs = await setDomainRateLimited(hostnameId, 10_000)
    const result = await getDomainRateLimitRemainingMs(hostnameId)

    expect(lockMs).toBe(10_000)
    expect(result).toBeGreaterThan(1_000)
    expect(result).toBeLessThanOrEqual(10_000)
  })
})
