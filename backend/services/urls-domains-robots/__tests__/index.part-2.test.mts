import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRobotsTxt, fetchRobotsTxtCached, isUrlCrawlable } from '../index.mts'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { insertTestDomainBlacklist, insertTestUrlHostname } from '@voucha/test-helpers'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'

const mockFetchWithTimeoutSimple = vi.fn<VitestLooseMock>()
const dependencies = {
  fetchWithTimeoutSimple: mockFetchWithTimeoutSimple,
  isNetworkError: vi.fn<VitestLooseMock>(),
  isRetryableError: vi.fn<VitestLooseMock>(),
  readResponseBody: vi.fn<VitestLooseMock>(),
}

function randomDomain() {
  return `test-robots-${Math.random().toString(36).slice(2)}.com`
}

function robotsResponse() {
  return { status: 200, statusText: 'OK', body: {} }
}

function isUrlCrawlableForTest(
  url: string,
  userAgent: string,
  options: { ignoreRobotsRules?: boolean } = {},
) {
  return isUrlCrawlable(url, userAgent, { ...options, dependencies })
}

function fetchRobotsTxtForTest(domain: string) {
  return fetchRobotsTxt(domain, dependencies)
}

describe('isUrlCrawlable with ignoreRobotsRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when robots.txt disallows path and no ignoreRobotsRules flag', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    dependencies.readResponseBody.mockResolvedValue('User-agent: *\nDisallow: /feeds/')

    const result = await isUrlCrawlableForTest(`https://${domain}/feeds/videos.xml`, 'Googlebot')

    expect(result).toBe(false)
  })

  it('returns true when robots.txt disallows path but ignoreRobotsRules=true', async () => {
    const domain = randomDomain()
    const result = await isUrlCrawlableForTest(`https://${domain}/feeds/videos.xml`, 'Googlebot', {
      ignoreRobotsRules: true,
    })

    expect(result).toBe(true)
    expect(mockFetchWithTimeoutSimple).not.toHaveBeenCalled()
  })

  it.each([
    ['blocked=true', { blocked: true } as const],
    ['crawlable=false', { crawlable: false } as const],
  ])('returns false for %s hostname even with ignoreRobotsRules=true', async (_, insert) => {
    const domain = randomDomain()
    await insertTestUrlHostname({ hostname: domain, ...insert })

    const result = await isUrlCrawlableForTest(`https://${domain}/feeds/videos.xml`, 'Googlebot', {
      ignoreRobotsRules: true,
    })

    expect(result).toBe(false)
    expect(mockFetchWithTimeoutSimple).not.toHaveBeenCalled()
  })

  it('respects the hard blacklist through the default dependency path', async () => {
    const domain = randomDomain()
    await insertTestDomainBlacklist(domain)
    await addDomainsToBloomFilter([domain])

    const result = await isUrlCrawlable(`https://${domain}/feeds/videos.xml`, 'Googlebot', {
      ignoreRobotsRules: true,
    })

    expect(result).toBe(false)
  })
})

describe('fetchRobotsTxt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries retryable fetch errors before returning robots.txt content', async () => {
    const domain = randomDomain()
    const retryableError = new Error('temporary upstream failure')
    mockFetchWithTimeoutSimple
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce(robotsResponse())
    dependencies.isNetworkError.mockReturnValue(false)
    dependencies.isRetryableError.mockReturnValue(true)
    dependencies.readResponseBody.mockResolvedValue('User-agent: *\nAllow: /')

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
    expect(dependencies.isRetryableError).toHaveBeenCalledWith(retryableError, undefined)
    expect(mockFetchWithTimeoutSimple).toHaveBeenCalledTimes(2)
  })

  it('returns permissive robots content after exhausting 5xx retries', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status: 503,
      statusText: 'Service Unavailable',
      body: {},
    })
    dependencies.isNetworkError.mockReturnValue(false)
    dependencies.isRetryableError.mockReturnValue(false)

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
    expect(mockFetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
  })

  it('returns a fresh Valkey cache hit without fetching', async () => {
    const domain = `${randomDomain()}.invalid`
    const cachedRobotsTxt = 'User-agent: *\nDisallow: /cached-only'
    const cache = new ValkeyCache({
      prefix: 'urls-domains-robots',
      ttlSeconds: 60 * 60 * 24,
    })
    await cache.set(domain, cachedRobotsTxt)

    try {
      await expect(fetchRobotsTxtCached(domain)).resolves.toBe(cachedRobotsTxt)
      expect(mockFetchWithTimeoutSimple).not.toHaveBeenCalled()
    } finally {
      await cache.delete(domain)
    }
  })

  it.each([
    [301, 'Moved Permanently'],
    [302, 'Found'],
  ])('throws for unusual HTTP status %i', async (status, statusText) => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status,
      statusText,
      body: {},
    })
    dependencies.isNetworkError.mockReturnValue(false)
    dependencies.isRetryableError.mockReturnValue(false)

    await expect(fetchRobotsTxtForTest(domain)).rejects.toThrow(
      `Failed to fetch robots.txt for ${domain}: ${status} ${statusText}`,
    )
    expect(mockFetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
  })

  it('propagates retryable non-network errors after retries are exhausted', async () => {
    vi.useFakeTimers()
    try {
      const domain = randomDomain()
      const retryableError = new Error('temporary upstream failure')
      mockFetchWithTimeoutSimple.mockRejectedValue(retryableError)
      dependencies.isNetworkError.mockReturnValue(false)
      dependencies.isRetryableError.mockReturnValue(true)

      const result = fetchRobotsTxtForTest(domain)
      const resultRejection = result.catch((error: unknown) => error)
      await vi.runAllTimersAsync()

      await expect(resultRejection).resolves.toBe(retryableError)
      expect(mockFetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
      expect(dependencies.readResponseBody).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
