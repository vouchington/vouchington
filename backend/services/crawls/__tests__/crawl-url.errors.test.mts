import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

import { crawlUrl } from '../crawl-url.mts'

import { addUrl } from '@services/urls/upsert'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'

import { createTestUser } from '@voucha/test-helpers'

import { pollUntilNotNull } from '@voucha/test-helpers/polling'

import { getTestHostnameDnsStats } from '@voucha/test-helpers/entities/url-hostnames'

import type { PrivateUser } from '@services/users/types'

const fetchCrawlerHtml = vi.fn<VitestLooseMock>()
const isUrlCrawlable = vi.fn<VitestLooseMock>().mockResolvedValue(true)
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

let user: PrivateUser

describe('crawl-url.errors', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('crawlUrl - Rate Limit Lock (Valkey)', () => {
    it('should throw CrawlerRateLimitError without creating a crawl when domain is rate-limited', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `ratelimit-locked-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      // Set a real rate limit in Valkey for this hostname
      setDomainRateLimitedBackground(url!.hostname.id, 30_000)
      // Poll until Valkey key is set before crawlUrl checks it
      await pollUntilNotNull(() => getDomainRateLimitRemainingMs(url!.hostname.id))

      let thrownError: any
      try {
        await crawlUrlForTest(url!.id)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeInstanceOf(CrawlerRateLimitError)
      expect(thrownError.retryAfterMs).toBeGreaterThan(0)
      expect(fetchCrawlerHtml).not.toHaveBeenCalled()

      const crawlCount = await countCrawlsForUrl(url!.id)
      expect(crawlCount).toBe(0)
    })

    it('should briefly lock the domain when Retry-After is 0', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `ratelimit-zero-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockRejectedValueOnce(
        new CrawlerRateLimitError(`https://${hostname}/page`, 429, 10, 0),
      )

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerRateLimitError)

      const remainingMs = await getDomainRateLimitRemainingMs(url!.hostname.id)
      expect(remainingMs).toBeGreaterThan(0)
      expect(remainingMs).toBeLessThanOrEqual(IMMEDIATE_RETRY_RATE_LIMIT_MS)
    })
  })

  describe('crawlUrl - Error Handling', () => {
    it('should record timeout error and re-throw CrawlerTimeoutError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `timeout-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const timeoutError = new CrawlerTimeoutError(`https://${hostname}/page`, 30_000, 30_000)
      fetchCrawlerHtml.mockRejectedValueOnce(timeoutError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerTimeoutError)

      const crawlCount = await countCrawlsForUrl(url!.id)
      expect(crawlCount).toBe(1)
    })

    it('should record network error and re-throw CrawlerNetworkError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `network-err-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const networkError = new CrawlerNetworkError(
        `https://${hostname}/page`,
        1000,
        new Error('ECONNREFUSED'),
      )
      fetchCrawlerHtml.mockRejectedValueOnce(networkError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerNetworkError)

      const crawlCount = await countCrawlsForUrl(url!.id)
      expect(crawlCount).toBe(1)
    })

    it('should record server error and re-throw CrawlerServerError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `server-err-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const serverError = new CrawlerServerError(`https://${hostname}/page`, 500, 1000)
      fetchCrawlerHtml.mockRejectedValueOnce(serverError)

      await expect(crawlUrlForTest(url!.id)).rejects.toThrow(CrawlerServerError)

      const crawlCount = await countCrawlsForUrl(url!.id)
      expect(crawlCount).toBe(1)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getTestHostnameDnsStats)
  void (0 as unknown as typeof CrawlerResponseSizeExceededError)
  void (0 as unknown as typeof CrawlerHttpClientError)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof getLatestCrawlNetworkError)
  void (0 as unknown as typeof getLatestCrawlStatusCode)
})
