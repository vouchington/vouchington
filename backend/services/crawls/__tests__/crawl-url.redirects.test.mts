import { describe, it, expect, vi } from 'vitest'

import { addUrl } from '@services/urls/upsert'

import { getUrlById } from '@services/urls/get'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'

import { useCrawlUrlRedirectHarness } from '@voucha/test-helpers/services/crawls/crawl-url-redirect-harness'

import { CrawlerTimeoutError } from '@modules/on-error/errors'

describe('crawl-url.redirects', () => {
  const { fetchCrawlerHtml, crawlUrlForTest, createMockCrawlerResult, user } =
    useCrawlUrlRedirectHarness()

  describe('crawlUrl - Permanent Redirects (301/308)', () => {
    it('should follow 301 redirect and set canonical URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-301-${random}.example.com`

      const originalUrl = await addUrl(user().id, `https://${hostname}/old`)
      await createCrawler(user(), {
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

      const originalUrl = await addUrl(user().id, `https://${hostname}/old`)
      await createCrawler(user(), {
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

      const originalUrl = await addUrl(user().id, `https://${hostname}/temp`)
      await createCrawler(user(), {
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

      const originalUrl = await addUrl(user().id, `https://${sourceHostname}/temp`, {
        skipCreatedEvents: true,
      })
      await createCrawler(user(), {
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

      const originalUrl = await addUrl(user().id, `http://${sourceHostname}/temp`, {
        preserveHttp: true,
        skipCreatedEvents: true,
      })
      await createCrawler(user(), {
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

      const originalUrl = await addUrl(user().id, `https://${hostname}/temp`)
      await createCrawler(user(), {
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

      const originalUrl = await addUrl(user().id, `https://${hostname}/old`)
      await createCrawler(user(), {
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
