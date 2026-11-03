import { randomUUID } from 'node:crypto'
import { beforeEach, it, expect, describe, vi } from 'vitest'
import type { RobotsDependencies } from '../fetch-retry.mts'
import {
  pinnedRobotsFetchResult,
  resolvePublicRobotsAddresses,
  ROBOTS_PUBLIC_ADDRESSES,
} from '../../../test-helpers/robots-pinned-fetch.mts'
import { fetchRobotsTxtCached, isUrlCrawlable } from '../index.mts'
import { insertTestDomainBlacklist } from '@voucha/test-helpers'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'

// Exercise a controlled HTTP 404 through the public API while keeping the real cache.
const fetchWithTimeout = vi.fn<RobotsDependencies['fetchWithTimeout']>()
const dependencies = { validateUrl: resolvePublicRobotsAddresses, fetchWithTimeout }
let exampleCom: string
let exampleNet: string
let exampleOrg: string
const PERMISSIVE_ROBOTS_TXT = 'User-agent: *\nAllow: /'

describe('index.generated', () => {
  beforeEach(() => {
    exampleCom = `${randomUUID()}.example.com`
    exampleNet = `${randomUUID()}.example.net`
    exampleOrg = `${randomUUID()}.example.org`
    fetchWithTimeout
      .mockReset()
      .mockResolvedValue(pinnedRobotsFetchResult(new Response(null, { status: 404 })))
  })

  it('fetchRobotsTxtCached repeats the permissive body for example.net', async () => {
    const first = await fetchRobotsTxtCached(exampleNet, dependencies)
    const second = await fetchRobotsTxtCached(exampleNet, dependencies)
    expect(first).toBe(PERMISSIVE_ROBOTS_TXT)
    expect(second).toBe(first)
    expect(fetchWithTimeout).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        url: `https://${exampleNet}/robots.txt`,
        resolvedAddresses: ROBOTS_PUBLIC_ADDRESSES,
      }),
    )
  })

  it('isUrlCrawlable allows every user agent when example.net has no robots rules', async () => {
    const url = `https://${exampleNet}/guide`
    await expect(isUrlCrawlable(url, 'Googlebot/2.1', { dependencies })).resolves.toBe(true)
    await expect(isUrlCrawlable(url, 'MyCustomBot/1.0', { dependencies })).resolves.toBe(true)
  })

  it('isUrlCrawlable allows each reserved example domain', async () => {
    await expect(
      isUrlCrawlable(`https://${exampleCom}/`, 'MyBot/1.0', { dependencies }),
    ).resolves.toBe(true)
    await expect(
      isUrlCrawlable(`https://${exampleNet}/`, 'MyBot/1.0', { dependencies }),
    ).resolves.toBe(true)
    await expect(
      isUrlCrawlable(`https://${exampleOrg}/`, 'MyBot/1.0', { dependencies }),
    ).resolves.toBe(true)
  })

  it('fetchRobotsTxtCached returns disallow robots.txt for blacklisted domains', async () => {
    const testDomain = `test-blacklist-${Math.random().toString(36).slice(2)}.com`

    // Add domain to blacklist and bloom filter so checkDomainBlacklisted takes the full query path
    await insertTestDomainBlacklist(testDomain)
    await addDomainsToBloomFilter([testDomain])

    const result = await fetchRobotsTxtCached(testDomain, dependencies)

    expect(result).toBe('User-agent: *\nDisallow: /')
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('isUrlCrawlable returns false for blacklisted domains', async () => {
    const testDomain = `test-blacklist-crawl-${Math.random().toString(36).slice(2)}.com`

    // Add domain to blacklist and bloom filter so checkDomainBlacklisted takes the full query path
    await insertTestDomainBlacklist(testDomain)
    await addDomainsToBloomFilter([testDomain])

    const result = await isUrlCrawlable(`https://${testDomain}/page`, 'MyBot/1.0', { dependencies })

    expect(result).toBe(false)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })
})
