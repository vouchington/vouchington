import {
  createCrawlUrlErrorMocks,
  withRecordedDnsFailure,
} from '@voucha/test-helpers/services/crawls/crawl-url-error-mocks'
import { setDomainRateLimitedBackground } from '@voucha/test-helpers/services/crawls/domain-rate-limit'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

import { addUrl } from '@services/urls/upsert'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'

import { createTestUser, updateUrlHostnameBlocked } from '@voucha/test-helpers'

import { getTestHostnameDnsStats } from '@voucha/test-helpers/entities/url-hostnames'

import type { PrivateUser } from '@services/users/types'

const { fetchCrawlerHtml, resolveDnsCanary, crawlUrlForTest } = createCrawlUrlErrorMocks()

import { getDomainRateLimitRemainingMs } from '../domain-rate-limit.mts'

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

  describe('crawlUrl - Blocked/Uncrawlable Hostname', () => {
    it('should return null for blocked hostname', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `blocked-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { is_crawlable: true })
      await updateUrlHostnameBlocked(url!.hostname.id, true)

      const result = await crawlUrlForTest(url!.id)
      expect(result).toBeNull()
      expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    })

    it('should return null for uncrawlable hostname', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `uncrawlable-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { is_crawlable: false })

      const result = await crawlUrlForTest(url!.id)
      expect(result).toBeNull()
      expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    })
  })

  describe('crawlUrl - DNS canary safeguard', () => {
    it('leaves the hostname DNS counter unchanged when the resolver canary fails', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `canary-down-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { is_crawlable: true })

      resolveDnsCanary.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND cloudflare.com'))
      fetchCrawlerHtml.mockRejectedValueOnce(
        new CrawlerNetworkError(`https://${hostname}/page`, 1000, new Error('ENOTFOUND')),
      )

      await expect(withRecordedDnsFailure(() => crawlUrlForTest(url!.id))).rejects.toThrow(
        CrawlerNetworkError,
      )

      expect(resolveDnsCanary).toHaveBeenCalledTimes(1)

      const stats = await getTestHostnameDnsStats(url!.hostname.id)
      expect(stats!.consecutive_dns_failures).toBe(0)
      expect(stats!.last_dns_failure_at).toBeNull()
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof countCrawlsForUrl)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof getDomainRateLimitRemainingMs)
  void (0 as unknown as typeof setDomainRateLimitedBackground)
  void (0 as unknown as typeof CrawlerRateLimitError)
  void (0 as unknown as typeof CrawlerTimeoutError)
  void (0 as unknown as typeof CrawlerServerError)
  void (0 as unknown as typeof CrawlerResponseSizeExceededError)
  void (0 as unknown as typeof CrawlerHttpClientError)
  void (0 as unknown as typeof getLatestCrawlNetworkError)
  void (0 as unknown as typeof getLatestCrawlStatusCode)
})
