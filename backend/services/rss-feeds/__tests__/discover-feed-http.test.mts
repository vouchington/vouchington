import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverFeedUrlFromHtml } from '../discover-feed.mts'

const PAGE_URL = 'https://example.com/'
const FEED_URL = 'https://example.com/feed.xml'
const URL_ID = 'url-id'
const FINAL_URL_ID = 'final-url-id'
const HOSTNAME_ID = 'hostname-id'
const CRAWL_ID = 'crawl-id'

const URL_RECORD = {
  id: URL_ID,
  url: PAGE_URL,
  hostname: { id: HOSTNAME_ID },
}

function makeDependencies() {
  return {
    addUrl: vi.fn<VitestLooseMock>(),
    getOrCreateCrawlerForHostname: vi.fn<VitestLooseMock>(),
    enqueueCrawlUrlAndWait: vi.fn<VitestLooseMock>(),
    getCrawlById: vi.fn<VitestLooseMock>(),
    getLatestHtmlSnapshotCrawlBefore: vi.fn<VitestLooseMock>(),
    getUrlById: vi.fn<VitestLooseMock>(),
  }
}

describe('discoverFeedUrlFromHtml', () => {
  let dependencies: ReturnType<typeof makeDependencies>

  beforeEach(() => {
    dependencies = makeDependencies()
    dependencies.addUrl.mockResolvedValue(URL_RECORD)
    dependencies.getOrCreateCrawlerForHostname.mockResolvedValue({})
    dependencies.enqueueCrawlUrlAndWait.mockResolvedValue({
      url_id: URL_ID,
      crawl_id: CRAWL_ID,
      response_status_code: 200,
    })
    dependencies.getCrawlById.mockResolvedValue({
      links: { alternate: { 'application/rss+xml': [FEED_URL] } },
    })
    dependencies.getLatestHtmlSnapshotCrawlBefore.mockResolvedValue(null)
    dependencies.getUrlById.mockResolvedValue(URL_RECORD)
  })

  it('runs an HTML crawl job at highest priority and returns the discovered feed URL', async () => {
    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBe(FEED_URL)
    expect(dependencies.addUrl).toHaveBeenCalledWith(null, PAGE_URL, {
      preserveHttp: false,
      skipCreatedEvents: true,
    })
    expect(dependencies.getOrCreateCrawlerForHostname).toHaveBeenCalledWith(null, HOSTNAME_ID)
    expect(dependencies.enqueueCrawlUrlAndWait).toHaveBeenCalledWith(
      { urlId: URL_ID },
      {
        hostnameId: HOSTNAME_ID,
        crawlTimeoutMs: 10000,
        ensureCrawlerForRedirects: true,
        ignoreRobotsTxt: true,
        maxResponseSizeBytes: 256 * 1024,
        preserveHttpRedirects: false,
        priority: 0,
        rateLimitMs: 1000,
        skipCanonicalUrl: true,
        skipChunks: true,
        skipEmbedResolution: true,
        skipCreatedEventsForRedirects: true,
        waitTimeoutMs: 30000,
      },
    )
    expect(dependencies.getUrlById).toHaveBeenCalledWith(URL_ID)
    expect(dependencies.getCrawlById).toHaveBeenCalledWith(CRAWL_ID, URL_ID)
  })

  it('resolves relative feed links against the final crawled URL', async () => {
    dependencies.enqueueCrawlUrlAndWait.mockResolvedValueOnce({
      url_id: FINAL_URL_ID,
      crawl_id: CRAWL_ID,
      response_status_code: 200,
    })
    dependencies.getUrlById.mockResolvedValueOnce({
      id: FINAL_URL_ID,
      url: 'https://www.example.com/blog/',
      hostname: { id: 'final-hostname-id' },
    })
    dependencies.getCrawlById.mockResolvedValueOnce({
      links: { alternate: { 'application/rss+xml': ['/feed.xml'] } },
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBe(
      'https://www.example.com/feed.xml',
    )
  })

  it('preserves http URLs when creating the crawl URL record', async () => {
    const pageUrl = 'http://example.com/'
    await discoverFeedUrlFromHtml(pageUrl, dependencies)

    expect(dependencies.addUrl).toHaveBeenCalledWith(null, pageUrl, {
      preserveHttp: true,
      skipCreatedEvents: true,
    })
    expect(dependencies.enqueueCrawlUrlAndWait).toHaveBeenCalledWith(
      { urlId: URL_ID },
      expect.objectContaining({ preserveHttpRedirects: true }),
    )
  })

  it('returns null when the page URL is not added', async () => {
    dependencies.addUrl.mockResolvedValueOnce(null)

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
    expect(dependencies.enqueueCrawlUrlAndWait).not.toHaveBeenCalled()
  })

  it('returns null when the page URL record is missing a hostname ID', async () => {
    dependencies.addUrl.mockResolvedValueOnce({
      id: URL_ID,
      url: PAGE_URL,
      hostname: {},
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
    expect(dependencies.enqueueCrawlUrlAndWait).not.toHaveBeenCalled()
  })

  it('returns null when the crawl job does not finish in time', async () => {
    dependencies.enqueueCrawlUrlAndWait.mockResolvedValueOnce(null)

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
    expect(dependencies.getCrawlById).not.toHaveBeenCalled()
  })

  it('returns null without loading crawl links when the crawl status is not successful', async () => {
    dependencies.enqueueCrawlUrlAndWait.mockResolvedValueOnce({
      url_id: URL_ID,
      crawl_id: CRAWL_ID,
      response_status_code: 404,
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
    expect(dependencies.getCrawlById).not.toHaveBeenCalled()
  })

  it('uses previous snapshot links when the crawl returns 304', async () => {
    dependencies.enqueueCrawlUrlAndWait.mockResolvedValueOnce({
      url_id: URL_ID,
      crawl_id: CRAWL_ID,
      response_status_code: 304,
    })
    dependencies.getLatestHtmlSnapshotCrawlBefore.mockResolvedValueOnce({
      links: { alternate: { 'application/rss+xml': ['/cached-feed.xml'] } },
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBe(
      'https://example.com/cached-feed.xml',
    )
    expect(dependencies.getLatestHtmlSnapshotCrawlBefore).toHaveBeenCalledWith(URL_ID, CRAWL_ID)
    expect(dependencies.getCrawlById).not.toHaveBeenCalled()
  })

  it('returns null when the latest 304 snapshot has no feed links', async () => {
    dependencies.enqueueCrawlUrlAndWait.mockResolvedValueOnce({
      url_id: URL_ID,
      crawl_id: CRAWL_ID,
      response_status_code: 304,
    })
    dependencies.getLatestHtmlSnapshotCrawlBefore.mockResolvedValueOnce({
      links: {},
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
    expect(dependencies.getLatestHtmlSnapshotCrawlBefore).toHaveBeenCalledWith(URL_ID, CRAWL_ID)
    expect(dependencies.getCrawlById).not.toHaveBeenCalled()
  })

  it('returns null when the crawl has no feed link', async () => {
    dependencies.getCrawlById.mockResolvedValueOnce({
      links: { canonical: PAGE_URL },
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
  })

  it('ignores non-string alternate feed values', async () => {
    dependencies.getCrawlById.mockResolvedValueOnce({
      links: { alternate: { 'application/rss+xml': { href: FEED_URL } } },
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
  })

  it('keeps scanning case-variant feed buckets after invalid exact links', async () => {
    dependencies.getCrawlById.mockResolvedValueOnce({
      links: {
        alternate: {
          'application/rss+xml': ['ftp://example.com/feed.xml'],
          'Application/RSS+XML': [FEED_URL],
        },
      },
    })

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBe(FEED_URL)
  })

  it('returns null when any queued crawl setup step throws', async () => {
    dependencies.getOrCreateCrawlerForHostname.mockRejectedValueOnce(new Error('blocked'))

    expect(await discoverFeedUrlFromHtml(PAGE_URL, dependencies)).toBeNull()
  })
})
