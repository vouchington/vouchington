import { describe, expect, it, vi } from 'vitest'
import { CrawlerInvalidContentTypeError } from '@modules/on-error/errors'
import { fetchAndClassifyFeed } from '../validate.mts'

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'
const PAGE_URL = 'https://example.com/'
const FEED_URL = 'https://example.com/feed.xml'

describe('fetchAndClassifyFeed — autodiscovery', () => {
  it('returns a redirect to the discovered feed when the URL serves HTML with a feed link', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValue(
        new CrawlerInvalidContentTypeError(PAGE_URL, HTML_CONTENT_TYPE, 50, [
          'application/rss+xml',
          'application/atom+xml',
        ]),
      )
    const discoverFeedUrlFromHtml = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(FEED_URL)

    const result = await fetchAndClassifyFeed(PAGE_URL, {
      crawlerRss,
      discoverFeedUrlFromHtml,
    })

    expect(result).toEqual({ kind: 'redirect', location: FEED_URL, isPermanent: false })
    expect(discoverFeedUrlFromHtml).toHaveBeenCalledWith(PAGE_URL)
  })

  it('throws 422 when the HTML page has no feed link', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValue(
        new CrawlerInvalidContentTypeError(PAGE_URL, HTML_CONTENT_TYPE, 50, [
          'application/rss+xml',
        ]),
      )
    const discoverFeedUrlFromHtml = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(null)

    await expect(
      fetchAndClassifyFeed(PAGE_URL, { crawlerRss, discoverFeedUrlFromHtml }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('throws 422 when discoverFeedUrlFromHtml throws', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValue(
        new CrawlerInvalidContentTypeError(PAGE_URL, HTML_CONTENT_TYPE, 50, [
          'application/rss+xml',
        ]),
      )
    const discoverFeedUrlFromHtml = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValue(new Error('network error'))

    await expect(
      fetchAndClassifyFeed(PAGE_URL, { crawlerRss, discoverFeedUrlFromHtml }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('throws 422 for non-HTML invalid content type without attempting discovery', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValue(
        new CrawlerInvalidContentTypeError(PAGE_URL, 'image/png', 50, ['application/rss+xml']),
      )
    const discoverFeedUrlFromHtml = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(null)

    await expect(
      fetchAndClassifyFeed(PAGE_URL, { crawlerRss, discoverFeedUrlFromHtml }),
    ).rejects.toMatchObject({ status: 422 })
    expect(discoverFeedUrlFromHtml).not.toHaveBeenCalled()
  })

  it('does not return a redirect when discovery returns the same URL as the page', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValue(
        new CrawlerInvalidContentTypeError(PAGE_URL, HTML_CONTENT_TYPE, 50, [
          'application/rss+xml',
        ]),
      )
    const discoverFeedUrlFromHtml = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(PAGE_URL)

    await expect(
      fetchAndClassifyFeed(PAGE_URL, { crawlerRss, discoverFeedUrlFromHtml }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
