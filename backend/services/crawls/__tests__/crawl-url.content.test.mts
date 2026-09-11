import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { crawlUrl } from '../crawl-url.mts'
import { addUrl } from '@services/urls/upsert'
import { getUrlById } from '@services/urls/get'
import { createCrawler } from '@services/crawlers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createTestUser } from '@voucha/test-helpers'
import { getCrawlChunks } from '@voucha/test-helpers/entities/crawl-chunks'
import type { CrawlerHtmlResult } from '@services/crawler-html/types'
import type { PrivateUser } from '@services/users/types'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

const captureException = sentryCaptureExceptionMock

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

import { countCrawlsForUrl } from '@voucha/test-helpers/entities/crawls'
let user: PrivateUser

describe('crawl-url.content', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockCrawlerResult = (
    statusCode: number,
    canonicalUrl: string | null = null,
    location: string | null = null,
    meta: Record<string, string> = {},
    responseHeaders: Record<string, string> = {},
  ): CrawlerHtmlResult => ({
    response_status_code: statusCode,
    request_headers: { 'User-Agent': 'test' },
    response_headers: { ...(location ? { location } : {}), ...responseHeaders },
    crawl_started_at: new Date(),
    crawl_completed_at: new Date(),
    content: {
      title: 'Test',
      meta,
      links: canonicalUrl ? { canonical: canonicalUrl } : {},
      content: 'Test content',
      canonicalUrl: canonicalUrl ?? undefined,
    },
  })

  describe('crawlUrl - HTML Canonical Link', () => {
    it('should set canonical URL from HTML link tag', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `canonical-html-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(200, `https://${hostname}/canonical`, null),
      )

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()

      const updatedUrl = await getUrlById(url!.id)
      expect(updatedUrl!.canonical_url_id).not.toBeNull()
    })

    it('should skip canonical URL writes when requested', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `skip-canonical-html-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(200, `https://${hostname}/canonical`, null),
      )

      const result = await crawlUrlForTest(url!.id, 0, new Set(), { skipCanonicalUrl: true })

      expect(result).not.toBeNull()

      const updatedUrl = await getUrlById(url!.id)
      expect(updatedUrl!.canonical_url_id).toBeNull()
    })

    it('should not set canonical URL when it matches the current URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `self-canonical-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, url!.url, null))

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()

      const updatedUrl = await getUrlById(url!.id)
      expect(updatedUrl!.canonical_url_id).toBeNull()
    })

    it('should not report an error when canonical URL normalizes to the current URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `normalized-self-canonical-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(200, `http://${hostname}/page#section`, null),
      )

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()
      expect(captureException).not.toHaveBeenCalled()

      const updatedUrl = await getUrlById(url!.id)
      expect(updatedUrl!.canonical_url_id).toBeNull()
    })

    it('should handle relative canonical URLs', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `relative-canonical-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page?param=1`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, '/page', null))

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()

      const updatedUrl = await getUrlById(url!.id)
      expect(updatedUrl!.canonical_url_id).not.toBeNull()
    })
  })

  describe('crawlUrl - noindex handling', () => {
    it('should store crawl but return empty markdown for noindex pages', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `noindex-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(200, null, null, { robots: 'noindex' }),
      )

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()
      expect(result!.markdown).toBe('')
      const chunks = await getCrawlChunks(url!.id, result!.id)
      expect(chunks).toHaveLength(0)
      const urlAfter = await getUrlById(url!.id)
      expect(urlAfter?.canonical_url_id).toBeNull()
    })

    it('should return empty markdown when X-Robots-Tag header is noindex', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `xrobots-noindex-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(200, null, null, {}, { 'x-robots-tag': 'noindex' }),
      )

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()
      expect(result!.markdown).toBe('')
      const chunks = await getCrawlChunks(url!.id, result!.id)
      expect(chunks).toHaveLength(0)
      const urlAfter = await getUrlById(url!.id)
      expect(urlAfter?.canonical_url_id).toBeNull()
    })
  })

  describe('crawlUrl - lang persistence', () => {
    it('should persist lang from HTML result', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `lang-test-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      const mockResult = createMockCrawlerResult(200)
      mockResult.content!.lang = 'en'
      fetchCrawlerHtml.mockResolvedValueOnce(mockResult)

      const result = await crawlUrlForTest(url!.id)

      expect(result).not.toBeNull()
      expect(result!.lang).toBe('en')
    })
  })

  describe('crawlUrl - Malformed Location Header', () => {
    it('should record crawl when redirect Location is malformed', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `malformed-loc-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/page`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(301, null, 'not-a-valid-url://[invalid'),
      )

      const result = await crawlUrlForTest(url!.id)
      expect(result).toMatchObject({
        response_status_code: 301,
        redirect_url_id: null,
      })

      const crawlCount = await countCrawlsForUrl(url!.id)
      expect(crawlCount).toBe(1)
    })
  })
})
