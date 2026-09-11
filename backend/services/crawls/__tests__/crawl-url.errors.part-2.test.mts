import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

import { crawlUrl } from '../crawl-url.mts'

import { addUrl } from '@services/urls/upsert'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'

import { createTestUser } from '@voucha/test-helpers'

import { pollUntilNotNull } from '@voucha/test-helpers/polling'

import { getTestHostnameDnsStats } from '@voucha/test-helpers/entities/url-hostnames'

import type { PrivateUser } from '@services/users/types'

const fetchCrawlerHtml = vi.fn<VitestLooseMock>()
const isUrlCrawlable = vi.fn<VitestLooseMock>().mockResolvedValue(true)
const resolveDnsCanary = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
const resolveSafeCrawlerAddresses = vi
  .fn<VitestLooseMock>()
  .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

function crawlUrlForTest(...args: Parameters<typeof crawlUrl>) {
  const [urlId, hopCount = 0, visitedUrls = new Set<string>(), options] = args
  return crawlUrl(urlId, hopCount, visitedUrls, {
    ...options,
    dependencies: {
      fetchCrawlerHtml,
      isUrlCrawlable,
      resolveDnsCanary,
      resolveSafeCrawlerAddresses,
      ...options?.dependencies,
    },
  })
}

import {
  getDomainRateLimitRemainingMs,
  IMMEDIATE_RETRY_RATE_LIMIT_MS,
  setDomainRateLimitedBackground,
} from '../domain-rate-limit.mts'

import {
  CrawlerRateLimitError,
  CrawlerTimeoutError,
  CrawlerNetworkError,
  CrawlerServerError,
  CrawlerResponseSizeExceededError,
  CrawlerHttpClientError,
} from '@modules/on-error/errors'

import { countCrawlsForUrl } from '@voucha/test-helpers/entities/crawls'

import {
  getLatestCrawlNetworkError,
  getLatestCrawlStatusCode,
} from '@voucha/test-helpers/entities/crawl-state'
import { createCrawl } from '../create.mts'
import { updateCrawl } from '../update.mts'
import { recordCrawlError } from '../crawl-url/errors.mts'

let user: PrivateUser

describe('crawl-url.errors', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('crawlUrl - network_error column values', () => {
    it('records network_error: timeout for CrawlerTimeoutError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `network-timeout-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const timeoutError = new CrawlerTimeoutError(`https://${hostname}/page`, 30_000, 30_000)
      fetchCrawlerHtml.mockRejectedValueOnce(timeoutError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerTimeoutError)

      expect(await getLatestCrawlNetworkError(url!.id)).toBe('timeout')
    }, 60_000)

    it('records network_error: dns for CrawlerNetworkError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `network-dns-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const networkError = new CrawlerNetworkError(
        `https://${hostname}/page`,
        1000,
        new Error('ENOTFOUND'),
      )
      fetchCrawlerHtml.mockRejectedValueOnce(networkError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerNetworkError)

      expect(await getLatestCrawlNetworkError(url!.id)).toBe('dns')
    }, 60_000)

    it('records network_error: dns for SSRF validation null-route DNS', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `network-null-route-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const nullRouteError = Object.assign(
        new Error(`DNS resolved ${hostname} to null-route address: ::`),
        { code: 'DNS_NULL_ROUTE' },
      )
      resolveSafeCrawlerAddresses.mockRejectedValueOnce(
        new CrawlerNetworkError(`https://${hostname}/page`, 0, nullRouteError),
      )

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerNetworkError)

      expect(fetchCrawlerHtml).not.toHaveBeenCalled()
      expect(await getLatestCrawlNetworkError(url!.id)).toBe('dns')
      expect(await getLatestCrawlStatusCode(url!.id)).toBe(502)

      const dnsStats = await pollUntilNotNull(async () => {
        const stats = await getTestHostnameDnsStats(url!.hostname.id)
        return stats && stats.consecutive_dns_failures > 0 ? stats : null
      })
      expect(dnsStats).not.toBeNull()
      expect(dnsStats?.consecutive_dns_failures).toBe(1)
      expect(dnsStats?.last_dns_failure_at).toBeInstanceOf(Date)
      expect(resolveDnsCanary).toHaveBeenCalledTimes(1)
    }, 60_000)

    it('records network_error: null for non-DNS CrawlerNetworkError (ECONNREFUSED)', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `network-refused-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const networkError = new CrawlerNetworkError(
        `https://${hostname}/page`,
        1000,
        new Error('connect ECONNREFUSED 127.0.0.1:443'),
      )
      fetchCrawlerHtml.mockRejectedValueOnce(networkError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerNetworkError)

      expect(await getLatestCrawlNetworkError(url!.id)).toBeNull()
    }, 60_000)
  })

  describe('crawlUrl - CrawlerResponseSizeExceededError handling', () => {
    it('records response_status_code 413 for CrawlerResponseSizeExceededError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `size-exceeded-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const sizeError = new CrawlerResponseSizeExceededError(
        `https://${hostname}/page`,
        2_000_000,
        1_000_000,
        500,
      )
      fetchCrawlerHtml.mockRejectedValueOnce(sizeError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerResponseSizeExceededError)

      expect(await getLatestCrawlStatusCode(url!.id)).toBe(413)
    }, 60_000)
  })

  describe('crawlUrl - CrawlerHttpClientError handling', () => {
    it('records response_status_code for CrawlerHttpClientError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `http-client-err-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const clientError = new CrawlerHttpClientError(`https://${hostname}/page`, 403, 200)
      fetchCrawlerHtml.mockRejectedValueOnce(clientError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerHttpClientError)

      expect(await getLatestCrawlStatusCode(url!.id)).toBe(403)
    }, 60_000)
  })

  describe('crawlUrl - non-crawler error handling', () => {
    it('records response_status_code 500 for unexpected errors', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `unexpected-err-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockRejectedValueOnce(new Error('S3 upload failed'))

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow('S3 upload failed')

      expect(await getLatestCrawlStatusCode(url!.id)).toBe(500)
    }, 60_000)

    it('preserves response_status_code when post-processing fails after completion', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `post-processing-err-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      const crawler = await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })
      const crawl = await createCrawl(url!.id, crawler.id)
      await updateCrawl(crawl.id, url!.id, {
        completed_at: new Date(),
        markdown: 'Fetched content',
        response_status_code: 200,
      })

      await recordCrawlError({
        crawlId: crawl.id,
        crawlStatusRecorded: false,
        error: new Error('chunk write failed'),
        hostname: (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!,
        urlId: url!.id,
      })

      expect(await getLatestCrawlStatusCode(url!.id)).toBe(200)
    }, 60_000)
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof CrawlerRateLimitError)
  void (0 as unknown as typeof CrawlerServerError)
  void (0 as unknown as typeof countCrawlsForUrl)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof getDomainRateLimitRemainingMs)
  void (0 as unknown as typeof IMMEDIATE_RETRY_RATE_LIMIT_MS)
  void (0 as unknown as typeof setDomainRateLimitedBackground)
})
