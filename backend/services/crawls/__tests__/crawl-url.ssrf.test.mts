import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { crawlUrl } from '../crawl-url.mts'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createTestUser } from '@voucha/test-helpers'
import { CrawlerSsrfError } from '@modules/on-error/errors'
import { countCrawlsForUrl } from '@voucha/test-helpers/entities/crawls'
import {
  getLatestCrawlNetworkError,
  getLatestCrawlStatusCode,
} from '@voucha/test-helpers/entities/crawl-state'
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

let user: PrivateUser

describe('crawl-url.ssrf', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('crawlUrl - SSRF protection', () => {
    it('records network_error: ssrf and response_status_code: 403 for CrawlerSsrfError', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `ssrf-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      resolveSafeCrawlerAddresses.mockRejectedValueOnce(
        new CrawlerSsrfError(`https://${hostname}/page`, 'DNS resolved to private IP: 10.0.0.1'),
      )

      await expect(crawlUrlForTest(url!.id)).rejects.toBeInstanceOf(CrawlerSsrfError)

      const crawlCount = await countCrawlsForUrl(url!.id)
      expect(crawlCount).toBe(1)

      expect(await getLatestCrawlNetworkError(url!.id)).toBe('ssrf')
      expect(await getLatestCrawlStatusCode(url!.id)).toBe(403)
    }, 60_000)

    it('re-throws CrawlerSsrfError after recording the crawl', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `ssrf-rethrow-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      resolveSafeCrawlerAddresses.mockRejectedValueOnce(
        new CrawlerSsrfError(`https://${hostname}/page`, 'IP address is private: 192.168.1.1'),
      )

      let thrownError: unknown
      try {
        await crawlUrlForTest(url!.id)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeInstanceOf(CrawlerSsrfError)
    }, 60_000)

    it('calls resolveSafeCrawlerAddresses before CrawlerHtml', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `ssrf-order-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, { hostname_id: url!.hostname.id, crawler_type: 'fetch' })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      resolveSafeCrawlerAddresses.mockRejectedValueOnce(
        new CrawlerSsrfError(`https://${hostname}/page`, 'test'),
      )

      await expect(crawlUrlForTest(url!.id)).rejects.toBeInstanceOf(CrawlerSsrfError)

      expect(resolveSafeCrawlerAddresses).toHaveBeenCalledWith(`https://${hostname}/page`, {
        timeoutMs: undefined,
      })
    }, 60_000)
  })
})
