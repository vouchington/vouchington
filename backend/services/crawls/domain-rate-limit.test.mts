import { rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { describe, expect, it, vi } from 'vitest'
import {
  getDomainRateLimitRemainingMs,
  normalizeDomainRateLimitMs,
  setDomainRateLimited,
} from './domain-rate-limit.mts'

describe('domain-rate-limit', () => {
  it('normalizes retry-after values before writing Valkey locks', () => {
    expect(normalizeDomainRateLimitMs()).toBe(60_000)
    expect(normalizeDomainRateLimitMs(0)).toBe(1_000)
    expect(normalizeDomainRateLimitMs(-1)).toBe(1_000)
    expect(normalizeDomainRateLimitMs(2_500)).toBe(2_500)
  })

  it('normalizes Valkey script results before returning lock durations', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    // invokeScript is declared as GlideReturnType. The normalizer accepts any stringifiable result.
    const scriptClient: {
      invokeScript(
        ...args: Parameters<typeof rateLimiterValkeyClient.invokeScript>
      ): Promise<unknown>
    } = rateLimiterValkeyClient
    const invoke = vi.spyOn(scriptClient, 'invokeScript')
    try {
      invoke.mockResolvedValueOnce(2_500)
      await expect(setDomainRateLimited(hostnameId)).resolves.toBe(2_500)
      invoke.mockResolvedValueOnce(2_500n)
      await expect(setDomainRateLimited(hostnameId)).resolves.toBe(2_500)
      invoke.mockResolvedValueOnce('2500')
      await expect(setDomainRateLimited(hostnameId)).resolves.toBe(2_500)
      invoke.mockResolvedValueOnce({ toString: () => '2500' })
      await expect(setDomainRateLimited(hostnameId)).resolves.toBe(2_500)
      invoke.mockResolvedValueOnce({ toString: () => 'not-a-number' })
      await expect(setDomainRateLimited(hostnameId)).rejects.toThrow(
        'set-domain-rate-limit returned invalid TTL: not-a-number',
      )
      invoke.mockResolvedValueOnce('not-a-number')
      await expect(setDomainRateLimited(hostnameId)).rejects.toThrow(
        'set-domain-rate-limit returned invalid TTL: not-a-number',
      )
    } finally {
      invoke.mockRestore()
    }
  })

  it('returns null when key does not exist', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    const result = await getDomainRateLimitRemainingMs(hostnameId)
    expect(result).toBeNull()
  })

  it('returns positive remaining ms after setting rate limit', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    await setDomainRateLimited(hostnameId, 10_000)
    const result = await getDomainRateLimitRemainingMs(hostnameId)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(10_000)
  })

  it('sets a brief lock when retryAfterMs is 0', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    const lockMs = await setDomainRateLimited(hostnameId, 0)
    const result = await getDomainRateLimitRemainingMs(hostnameId)
    expect(lockMs).toBe(1_000)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(1_000)
  })

  it('uses default 60s TTL when no retryAfterMs provided', async () => {
    const hostnameId = `test-${crypto.randomUUID()}.example.com`
    await setDomainRateLimited(hostnameId)
    const result = await getDomainRateLimitRemainingMs(hostnameId)
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
