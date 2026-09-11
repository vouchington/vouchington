import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isUrlCrawlable, fetchRobotsTxt, computeHostnameRateLimitMs } from '../index.mts'
import { insertTestDomainBlacklist, insertTestUrlHostname } from '@voucha/test-helpers'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'
import { HttpResponseSizeError } from '@modules/on-error/errors'

const mockFetchWithTimeoutSimple = vi.fn<VitestLooseMock>()
const mockIsNetworkError = vi.fn<VitestLooseMock>()
const mockIsRetryableError = vi.fn<VitestLooseMock>()
const mockReadResponseBody = vi.fn<VitestLooseMock>()
const dependencies = {
  fetchWithTimeoutSimple: mockFetchWithTimeoutSimple,
  isNetworkError: mockIsNetworkError,
  isRetryableError: mockIsRetryableError,
  readResponseBody: mockReadResponseBody,
}

function randomDomain() {
  return `test-robots-${Math.random().toString(36).slice(2)}.com`
}

function robotsResponse() {
  return { status: 200, statusText: 'OK', body: {} }
}

function fetchRobotsTxtForTest(domain: string) {
  return fetchRobotsTxt(domain, dependencies)
}

function isUrlCrawlableForTest(
  url: string,
  userAgent: string,
  options: { ignoreRobotsRules?: boolean } = {},
) {
  return isUrlCrawlable(url, userAgent, { ...options, dependencies })
}

function computeHostnameRateLimitMsForTest(
  hostname: string,
  requestsPerSecondLimit: number | null,
  userAgent: string,
) {
  return computeHostnameRateLimitMs(hostname, requestsPerSecondLimit, userAgent, dependencies)
}

describe('urls-domains-robots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns DISALLOW when hostname has crawlable=false in url_hostnames', async () => {
    const domain = randomDomain()
    await insertTestUrlHostname({ hostname: domain, crawlable: false })

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nDisallow: /')
    expect(mockFetchWithTimeoutSimple).not.toHaveBeenCalled()
  })

  it('fetches robots.txt when hostname is not blocked and not in blacklist', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nAllow: /')

    const result = await fetchRobotsTxtForTest(domain)

    // result is a direct passthrough of readResponseBody's mocked return value, so
    // matching it alone can't distinguish "actually fetched" from a hard-coded shortcut.
    // Assert the not-blocked/not-blacklisted path actually reached the real fetch call.
    expect(mockFetchWithTimeoutSimple).toHaveBeenCalledWith(`https://${domain}/robots.txt`, 10_000)
    expect(result).toBe('User-agent: *\nAllow: /')
  })

  it('returns DISALLOW when domain is in domain_blacklists', async () => {
    const domain = randomDomain()
    await insertTestDomainBlacklist(domain)
    await addDomainsToBloomFilter([domain])

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nDisallow: /')
  })

  it('returns 404 as ALLOW', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
    })

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
  })

  it('returns robots.txt content on successful fetch', async () => {
    const robotsContent = 'User-agent: *\nDisallow: /admin\nAllow: /'
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue(robotsContent)

    const result = await fetchRobotsTxtForTest(domain)

    // result is a direct passthrough of readResponseBody's mocked return value; assert the
    // body was actually read from the fetched response, not just returned unconditionally.
    expect(mockReadResponseBody).toHaveBeenCalledWith(
      expect.objectContaining({ url: `https://${domain}/robots.txt` }),
    )
    expect(result).toBe(robotsContent)
  })

  it('returns ALLOW for oversized robots.txt responses', async () => {
    const domain = randomDomain()
    const oversizedError = new HttpResponseSizeError(
      `https://${domain}/robots.txt`,
      524_289,
      524_288,
    )
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockRejectedValue(oversizedError)

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
    expect(mockReadResponseBody).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSizeBytes: 512 * 1024,
      }),
    )
  })

  it('treats a successful empty robots.txt response as allow all', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      body: null,
    })

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
    expect(mockReadResponseBody).not.toHaveBeenCalled()
  })

  it('returns ALLOW on network error', async () => {
    const domain = randomDomain()
    const networkError = new Error('Network timeout')
    mockFetchWithTimeoutSimple.mockRejectedValue(networkError)
    mockIsNetworkError.mockReturnValue(true)

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
  })

  it('retries on 5xx error and succeeds on retry', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple
      .mockResolvedValueOnce({
        status: 503,
        statusText: 'Service Unavailable',
      })
      .mockResolvedValueOnce(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nAllow: /')
    mockIsNetworkError.mockReturnValue(false)
    mockIsRetryableError.mockReturnValue(true)

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
    expect(mockFetchWithTimeoutSimple).toHaveBeenCalledTimes(2)
  })

  it('returns ALLOW on 4xx client errors (RFC 9309)', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status: 401,
      statusText: 'Unauthorized',
    })

    const result = await fetchRobotsTxtForTest(domain)

    expect(result).toBe('User-agent: *\nAllow: /')
  })
  it('returns false when domain is blacklisted', async () => {
    const domain = randomDomain()
    await insertTestDomainBlacklist(domain)
    await addDomainsToBloomFilter([domain])

    const result = await isUrlCrawlableForTest(`https://${domain}/page`, 'Googlebot')

    expect(result).toBe(false)
  })

  it('returns false when robots.txt disallows path', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nDisallow: /admin')

    const result = await isUrlCrawlableForTest(`https://${domain}/admin/panel`, 'Googlebot')

    expect(result).toBe(false)
  })

  it('returns true when robots.txt allows path', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nAllow: /')

    const result = await isUrlCrawlableForTest(`https://${domain}/page`, 'Googlebot')

    expect(result).toBe(true)
  })

  it('normalizes null robots.txt content to allow crawling', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue(null)

    const result = await isUrlCrawlableForTest(`https://${domain}/page`, 'Googlebot')

    expect(result).toBe(true)
  })

  it('returns false when the URL origin does not match robots.txt', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nAllow: /')

    const result = await isUrlCrawlableForTest(`http://${domain}/page`, 'Googlebot')

    expect(result).toBe(false)
  })

  it('returns true when 404 robots.txt (allows all)', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
    })

    const result = await isUrlCrawlableForTest(`https://${domain}/page`, 'Googlebot')

    expect(result).toBe(true)
  })
  it('uses default 1000ms when requestsPerSecondLimit is null', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nAllow: /')

    const result = await computeHostnameRateLimitMsForTest(domain, null, 'TestBot')

    expect(result).toBe(1000)
  })

  it('caps crawl-delay at 60000ms', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nCrawl-delay: 120')

    const result = await computeHostnameRateLimitMsForTest(domain, 10, 'TestBot')

    expect(result).toBe(60000)
  })

  it('uses crawl-delay when larger than requests-per-second', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nCrawl-delay: 5')

    const result = await computeHostnameRateLimitMsForTest(domain, 1, 'TestBot')

    expect(result).toBe(5000)
  })

  it('uses requests-per-second when larger than crawl-delay', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue('User-agent: *\nCrawl-delay: 0.1')

    const result = await computeHostnameRateLimitMsForTest(domain, 2, 'TestBot')

    expect(result).toBe(500)
  })

  it('ignores crawl-delay when robots.txt fetch fails with 404', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
    })

    const result = await computeHostnameRateLimitMsForTest(domain, 5, 'TestBot')

    expect(result).toBe(200)
  })
})
