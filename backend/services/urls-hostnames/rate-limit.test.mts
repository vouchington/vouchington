import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getTestHostnameNetworkBackoff,
  getTestHostnameRateLimitedUntil,
} from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { upsertUrlHostnames } from './upsert.mts'
import { recordHostnameRateLimitUntil } from './rate-limit.mts'

describe('recordHostnameRateLimitUntil', () => {
  it('writes rate_limit_ends_at only when the new end is later', async () => {
    const hostname = `rate-limit-until-${randomUUID()}.example.com`
    const hostnameId = (await upsertUrlHostnames(null, [hostname])).get(hostname)!

    await recordHostnameRateLimitUntil(hostnameId, 0)
    expect(await getTestHostnameRateLimitedUntil(hostnameId)).toBeNull()

    await recordHostnameRateLimitUntil(hostnameId, 120_000)
    const first = await getTestHostnameRateLimitedUntil(hostnameId)
    const firstUpdatedAt = (await getTestHostnameNetworkBackoff(hostnameId))!.updated_at
    expect(first).toBeInstanceOf(Date)
    expect(first!.getTime()).toBeGreaterThan(Date.now() + 90_000)

    await recordHostnameRateLimitUntil(hostnameId, 5_000)
    const afterShorter = await getTestHostnameRateLimitedUntil(hostnameId)
    const afterShorterUpdatedAt = (await getTestHostnameNetworkBackoff(hostnameId))!.updated_at
    expect(afterShorter).toEqual(first)
    expect(afterShorterUpdatedAt).toEqual(firstUpdatedAt)

    await recordHostnameRateLimitUntil(hostnameId, 300_000)
    const afterLonger = await getTestHostnameRateLimitedUntil(hostnameId)
    expect(afterLonger!.getTime()).toBeGreaterThan(first!.getTime())
  })
})
