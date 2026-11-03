import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

import { trySetCanonicalUrl } from '../crawl-url/redirects.mts'

import { addUrl } from '@services/urls/upsert'

import { getUrlById } from '@services/urls/get'

import { createCrawler } from '@services/crawlers'

import { updateUrlHostname } from '@services/urls-hostnames/update'

import { useCrawlUrlRedirectHarness } from '@voucha/test-helpers/services/crawls/crawl-url-redirect-harness'

describe('crawl-url.redirects', () => {
  const { fetchCrawlerHtml, crawlUrlForTest, createMockCrawlerResult, user } =
    useCrawlUrlRedirectHarness()

  describe('trySetCanonicalUrl', () => {
    beforeEach(() => {
      sentryCaptureExceptionMock.mockClear()
    })

    it('reports non-circular canonical update errors', async () => {
      const urlId = randomUUID()

      await trySetCanonicalUrl(urlId, urlId)

      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expect(sentryCaptureExceptionMock.mock.calls[0]![0]).toStrictEqual(
        new Error('URL cannot be its own canonical'),
      )
    })
  })

  describe('crawlUrl - Redirect Loop Prevention', () => {
    it('should stop following redirects after MAX_REDIRECT_HOPS', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const hostname = `redirect-loop-${random}.example.com`

      const url1 = await addUrl(user().id, `https://${hostname}/url1`)
      await createCrawler(user(), {
        hostname_id: url1!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url1!.hostname.id, { is_crawlable: true })

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

      const url1 = await addUrl(user().id, `https://${hostname}/a`)
      await createCrawler(user(), {
        hostname_id: url1!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url1!.hostname.id, { is_crawlable: true })

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

      const url = await addUrl(user().id, `https://${hostname}/self`)
      await createCrawler(user(), {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { is_crawlable: true })

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

      const url = await addUrl(user().id, `https://${hostname}/self`)
      await createCrawler(user(), {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url!.hostname.id, { is_crawlable: true })

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

      const url1 = await addUrl(user().id, `https://${hostname}/old`)
      await createCrawler(user(), {
        hostname_id: url1!.hostname.id,
        crawler_type: 'fetch',
      })
      await updateUrlHostname(url1!.hostname.id, { is_crawlable: true })

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
