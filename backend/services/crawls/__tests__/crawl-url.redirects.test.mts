import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

import { crawlUrl } from '../crawl-url.mts'

import { addUrl } from '@services/urls/upsert'

import { getUrlById } from '@services/urls/get'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'

import { createTestUser } from '@voucha/test-helpers'

import { CrawlerTimeoutError } from '@modules/on-error/errors'

import type { CrawlerHtmlResult } from '@services/crawler-html/types'

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

describe('crawl-url.redirects', () => {
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

  describe('crawlUrl - Permanent Redirects (301/308)', () => {
    it('should follow 301 redirect and set canonical URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-301-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `https://${hostname}/old`)
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(301, null, `https://${hostname}/new`),
      )

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

      const result = await crawlUrlForTest(originalUrl!.id)

      expect(result).not.toBeNull()

      const updatedOriginal = await getUrlById(originalUrl!.id)
      expect(updatedOriginal!.canonical_url_id).toBeDefined()
      expect(updatedOriginal!.canonical_url_id).not.toBeNull()
    })

    it('should follow 308 redirect and set canonical URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-308-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `https://${hostname}/old`)
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(308, null, `https://${hostname}/new`),
      )

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

      const result = await crawlUrlForTest(originalUrl!.id)

      expect(result).not.toBeNull()

      const updatedOriginal = await getUrlById(originalUrl!.id)
      expect(updatedOriginal!.canonical_url_id).not.toBeNull()
    })
  })

  describe('crawlUrl - Temporary Redirects (302/303/307)', () => {
    it('should follow 302 redirect but NOT set canonical URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-302-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `https://${hostname}/temp`)
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(302, null, `https://${hostname}/temporary-target`),
      )

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

      const result = await crawlUrlForTest(originalUrl!.id)

      expect(result).not.toBeNull()

      const updatedOriginal = await getUrlById(originalUrl!.id)
      expect(updatedOriginal!.canonical_url_id).toBeNull()
    })

    it('should create the redirected hostname crawler before discovery redirects continue', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const sourceHostname = `redirect-source-${random}.example.com`
      const targetHostname = `redirect-target-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `https://${sourceHostname}/temp`, {
        skipCreatedEvents: true,
      })
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(302, null, `https://${targetHostname}/feed-page`),
      )

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

      const result = await crawlUrlForTest(originalUrl!.id, 0, new Set(), {
        ensureCrawlerForRedirects: true,
      })

      expect(result).not.toBeNull()
      expect(result!.response_status_code).toBe(200)
    })

    it('should preserve HTTP and skip URL-created events for discovery redirects', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const sourceHostname = `redirect-http-source-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `http://${sourceHostname}/temp`, {
        preserveHttp: true,
        skipCreatedEvents: true,
      })
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(302, null, '/feed-page'))
      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

      const result = await crawlUrlForTest(originalUrl!.id, 0, new Set(), {
        ensureCrawlerForRedirects: true,
        preserveHttpRedirects: true,
        skipCreatedEventsForRedirects: true,
      })

      expect(result).not.toBeNull()
      const redirectedUrl = await getUrlById(result!.url_id)
      expect(redirectedUrl!.url).toBe(`http://${sourceHostname}/feed-page`)
    })

    it('should follow 307 redirect but NOT set canonical URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-307-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `https://${hostname}/temp`)
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(307, null, `https://${hostname}/temporary`),
      )

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

      const result = await crawlUrlForTest(originalUrl!.id)

      expect(result).not.toBeNull()

      const updatedOriginal = await getUrlById(originalUrl!.id)
      expect(updatedOriginal!.canonical_url_id).toBeNull()
    })
  })

  describe('crawlUrl - total timeout ceiling across hops', () => {
    it('inherits the deadline from hop 1 instead of resetting it per hop', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-deadline-${random}.example.com`

      const originalUrl = await addUrl(user!.id, `https://${hostname}/old`)
      await createCrawler(user!, {
        hostname_id: originalUrl!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(originalUrl!.hostname.id, { crawlable: true })

      // Advance the clock at the explicit redirect boundary. A fresh deadline at hop 2 would let
      // the second fetch run; carrying hop 1's 100ms deadline rejects before that fetch.
      let now = 0
      const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now)
      try {
        fetchCrawlerHtml.mockImplementationOnce(async () => {
          now = 101
          return createMockCrawlerResult(302, null, `https://${hostname}/new`)
        })
        fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))

        await expect(
          crawlUrlForTest(originalUrl!.id, 0, new Set(), { totalTimeoutMs: 100 }),
        ).rejects.toBeInstanceOf(CrawlerTimeoutError)

        // Hop 2 must never reach its own fetch — the inherited deadline trips before that call.
        expect(fetchCrawlerHtml).toHaveBeenCalledTimes(1)
      } finally {
        dateNow.mockRestore()
      }
    }, 60_000)
  })
})
