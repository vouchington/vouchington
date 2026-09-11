import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

import { crawlUrl } from '../crawl-url.mts'

import { trySetCanonicalUrl } from '../crawl-url/redirects.mts'

import { addUrl } from '@services/urls/upsert'

import { getUrlById } from '@services/urls/get'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'

import { createTestUser } from '@voucha/test-helpers'

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

  describe('trySetCanonicalUrl', () => {
    it('reports non-circular canonical update errors through injected handler', async () => {
      const reportError = vi.fn<(error: Error) => void>()

      await trySetCanonicalUrl('not-a-url-id', 'not-a-canonical-id', {
        onRedirectError: reportError,
      })

      expect(reportError).toHaveBeenCalledOnce()
      expect(reportError.mock.calls[0][0]).toBeInstanceOf(Error)
    })
  })

  describe('crawlUrl - Redirect Loop Prevention', () => {
    it('should stop following redirects after MAX_REDIRECT_HOPS', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-loop-${random}.example.com`

      const url1 = await addUrl(user!.id, `https://${hostname}/url1`)
      await createCrawler(user!, {
        hostname_id: url1!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url1!.hostname.id, { crawlable: true })

      let callCount = 0
      fetchCrawlerHtml.mockImplementation(() => {
        callCount++
        return Promise.resolve(
          createMockCrawlerResult(301, null, `https://${hostname}/redirect-${callCount}`),
        )
      })

      const result = await crawlUrlForTest(url1!.id)

      expect(result).not.toBeNull()
      expect(result!.response_status_code).toBe(301)
      expect(result!.redirect_url_id).toBeDefined()

      expect(fetchCrawlerHtml.mock.calls.length).toBe(10)
    })

    it('should detect and stop redirect loops early', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `loop-detect-${random}.example.com`

      const url1 = await addUrl(user!.id, `https://${hostname}/a`)
      await createCrawler(user!, {
        hostname_id: url1!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url1!.hostname.id, { crawlable: true })

      let callCount = 0
      fetchCrawlerHtml.mockImplementation(options => {
        callCount++
        const url = options.url
        if (url.includes('/a')) {
          return Promise.resolve(createMockCrawlerResult(301, null, `https://${hostname}/b`))
        } else if (url.includes('/b')) {
          return Promise.resolve(createMockCrawlerResult(301, null, `https://${hostname}/c`))
        }
        return Promise.resolve(createMockCrawlerResult(301, null, `https://${hostname}/a`))
      })

      const result = await crawlUrlForTest(url1!.id)

      expect(result).not.toBeNull()

      expect(callCount).toBeLessThan(10)
    })
  })

  describe('crawlUrl - Redirect to Self', () => {
    it('should record crawl without following redirect that points to same URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `self-redirect-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/self`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(301, null, url!.url))

      const result = await crawlUrlForTest(url!.id)

      expect(result).toMatchObject({
        response_status_code: 301,
        redirect_url_id: null,
      })

      expect(fetchCrawlerHtml.mock.calls.length).toBe(1)
    })

    it('should not report an error when redirect URL normalizes to the current URL', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `normalized-self-redirect-${random}.example.com`

      const url = await addUrl(user!.id, `https://${hostname}/self`)
      await createCrawler(user!, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(301, null, `http://${hostname}/self#section`),
      )

      const result = await crawlUrlForTest(url!.id)

      expect(result).toMatchObject({
        response_status_code: 301,
        redirect_url_id: null,
      })
      expect(fetchCrawlerHtml.mock.calls.length).toBe(1)

      const updatedUrl = await getUrlById(url!.id)
      expect(updatedUrl!.canonical_url_id).toBeNull()
    })
  })

  describe('crawlUrl - Combined Redirect and Canonical', () => {
    it('should handle 301 redirect followed by HTML canonical', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `combined-${random}.example.com`

      const url1 = await addUrl(user!.id, `https://${hostname}/old`)
      await createCrawler(user!, {
        hostname_id: url1!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url1!.hostname.id, { crawlable: true })

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(301, null, `https://${hostname}/new`),
      )

      fetchCrawlerHtml.mockResolvedValueOnce(
        createMockCrawlerResult(200, `https://${hostname}/canonical`, null),
      )

      const result = await crawlUrlForTest(url1!.id)

      expect(result).not.toBeNull()

      const updatedUrl1 = await getUrlById(url1!.id)
      expect(updatedUrl1!.canonical_url_id).not.toBeNull()
    })
  })
})
