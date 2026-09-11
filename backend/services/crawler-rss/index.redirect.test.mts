import { it, expect, vi, beforeEach, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import CrawlerRss from './index.mts'

const mockFetchUrl = vi.fn<VitestLooseMock>()
const mockReadBodyAsBuffer = vi.fn<VitestLooseMock>()
const mockHandleErrors = vi.fn<VitestLooseMock>()
const crawlerUtils = {
  fetchUrl: mockFetchUrl,
  readBodyAsBuffer: mockReadBodyAsBuffer,
  handleErrors: mockHandleErrors,
}

type CrawlerRequestRow = {
  success: string | boolean
  error_type?: string
}

function makeResponse(status: number, headers: Record<string, string | null> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    body: { cancel: vi.fn<VitestLooseMock>() },
  }
}

/** Wraps a fake response in the `{ response, responseSignal }` pair `fetchUrl` now resolves. */
function fetchUrlResult(response: unknown) {
  return { response, responseSignal: new AbortController().signal }
}

async function getRssCrawlerRows(domain: string): Promise<CrawlerRequestRow[]> {
  await flush()
  return query<CrawlerRequestRow>(
    `SELECT * FROM crawler_requests WHERE domain = '${domain}' AND crawler_type = 'rss'`,
  )
}

async function callCrawlerRss(url: string) {
  return CrawlerRss(url, { dependencies: crawlerUtils })
}

describe('index.redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHandleErrors.mockReturnValue(undefined)
  })

  it('CrawlerRss returns parsed feed, content hash, and headers for 200 responses', async () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      '<channel>',
      '<title>Example Feed</title>',
      '<link>https://example.com</link>',
      '<description>Example description</description>',
      '<item><title>Item 1</title><link>https://example.com/1</link></item>',
      '</channel>',
      '</rss>',
    ].join('')
    const xmlBuffer = Buffer.from(xml)
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(
        makeResponse(200, {
          'content-type': 'application/rss+xml',
          etag: '"feed-etag"',
          'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        }),
      ) as never,
    )
    mockReadBodyAsBuffer.mockResolvedValueOnce(xmlBuffer)

    const result = await callCrawlerRss('https://rss-success.example.com/feed.xml')

    expect(result.responseCode).toBe(200)
    expect(result.headers).toEqual({
      etag: '"feed-etag"',
      lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT',
    })
    expect(result.contentSha256).toEqual(createHash('sha256').update(xmlBuffer).digest())
    expect(result.feed).toMatchObject({ title: 'Example Feed' })
    const rows = await getRssCrawlerRows('rss-success.example.com')
    expect(rows.some(row => String(row.success) === 'true')).toBe(true)
    expect(rows.some(row => String(row.success) === 'false')).toBe(false)
  })

  it('CrawlerRss accepts standard JSON Feed content types', async () => {
    const jsonFeed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Example JSON Feed',
      home_page_url: 'https://example.com',
      feed_url: 'https://example.com/feed.json',
      items: [
        {
          id: 'item-1',
          url: 'https://example.com/1',
          title: 'Item 1',
          content_text: 'Example item',
        },
      ],
    })
    const feedBuffer = Buffer.from(jsonFeed)
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(
        makeResponse(200, { 'content-type': 'application/feed+json; charset=utf-8' }),
      ) as never,
    )
    mockReadBodyAsBuffer.mockResolvedValueOnce(feedBuffer)

    const result = await callCrawlerRss('https://example.com/feed.json')

    expect(result.responseCode).toBe(200)
    expect(mockFetchUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining('application/feed+json'),
          'accept-encoding': 'gzip, deflate, br',
        }),
      }),
    )
    expect(result.contentSha256).toEqual(createHash('sha256').update(feedBuffer).digest())
    expect(result.feed).toMatchObject({ title: 'Example JSON Feed' })
  })

  it('CrawlerRss returns 304 metadata and cancels the unused body', async () => {
    const response = makeResponse(304, {
      etag: '"cached-feed"',
      'last-modified': 'Thu, 02 Jan 2025 00:00:00 GMT',
    })
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(response) as never)

    const result = await callCrawlerRss('https://example.com/feed.xml')

    expect(result).toMatchObject({
      responseCode: 304,
      feed: null,
      contentSha256: null,
      headers: {
        etag: '"cached-feed"',
        lastModified: 'Thu, 02 Jan 2025 00:00:00 GMT',
      },
    })
    expect(response.body.cancel).toHaveBeenCalledOnce()
    expect(mockReadBodyAsBuffer).not.toHaveBeenCalled()
  })

  it('CrawlerRss returns redirect with isPermanent=true for 301', async () => {
    const response = makeResponse(301, { location: 'https://new.example.com/feed.xml' })
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(response) as never)

    const result = await callCrawlerRss('https://old.example.com/feed.xml')

    expect('redirect' in result && result.redirect).toBeTruthy()
    expect((result as { redirect: { location: string } }).redirect.location).toBe(
      'https://new.example.com/feed.xml',
    )
    expect((result as { redirect: { isPermanent: boolean } }).redirect.isPermanent).toBe(true)
    expect((result as { responseCode: number }).responseCode).toBe(301)
    expect((result as { feed: unknown }).feed).toBeNull()
    expect(response.body.cancel).toHaveBeenCalledOnce()
  })

  it('CrawlerRss preserves redirect results when body cancellation fails', async () => {
    const response = makeResponse(301, { location: 'https://new.example.com/feed.xml' })
    response.body.cancel.mockRejectedValueOnce(new Error('cancel failed'))
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(response) as never)

    const result = await callCrawlerRss('https://old.example.com/feed.xml')

    expect('redirect' in result && result.redirect).toBeTruthy()
    expect((result as { redirect: { location: string } }).redirect.location).toBe(
      'https://new.example.com/feed.xml',
    )
    expect(response.body.cancel).toHaveBeenCalledOnce()
  })

  it('CrawlerRss returns redirect with isPermanent=true for 308', async () => {
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(makeResponse(308, { location: 'https://new.example.com/feed.xml' })) as never,
    )

    const result = await callCrawlerRss('https://old.example.com/feed.xml')

    expect('redirect' in result && result.redirect).toBeTruthy()
    expect((result as { redirect: { isPermanent: boolean } }).redirect.isPermanent).toBe(true)
    expect((result as { responseCode: number }).responseCode).toBe(308)
  })

  it('CrawlerRss returns redirect with isPermanent=false for 302', async () => {
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(makeResponse(302, { location: 'https://tmp.example.com/feed.xml' })) as never,
    )

    const result = await callCrawlerRss('https://old.example.com/feed.xml')

    expect('redirect' in result && result.redirect).toBeTruthy()
    expect((result as { redirect: { isPermanent: boolean } }).redirect.isPermanent).toBe(false)
  })

  it('CrawlerRss preserves raw relative redirect locations', async () => {
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(makeResponse(302, { location: '../feed.xml' })) as never,
    )

    const result = await callCrawlerRss('https://old.example.com/blog/current.xml')

    expect('redirect' in result && result.redirect.location).toBe('../feed.xml')
  })

  it('CrawlerRss returns redirect with isPermanent=false for 307', async () => {
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(makeResponse(307, { location: 'https://tmp.example.com/feed.xml' })) as never,
    )

    const result = await callCrawlerRss('https://old.example.com/feed.xml')

    expect('redirect' in result && result.redirect).toBeTruthy()
    expect((result as { redirect: { isPermanent: boolean } }).redirect.isPermanent).toBe(false)
    expect((result as { responseCode: number }).responseCode).toBe(307)
  })

  it('CrawlerRss throws CrawlerHttpClientError for 3xx without Location header', async () => {
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(makeResponse(301, {})) as never)

    await expect(callCrawlerRss('https://old.example.com/feed.xml')).rejects.toThrow(Error)
  })

  it('CrawlerRss rejects invalid success content types and cancels the body', async () => {
    const response = makeResponse(200, { 'content-type': 'text/html; charset=utf-8' })
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(response) as never)

    const crawl = callCrawlerRss('https://example.com/feed.xml')
    await expect(crawl).rejects.toThrow(/Invalid content type.*\*\/\*\+xml/)
    expect(response.body.cancel).toHaveBeenCalledOnce()
    expect(mockReadBodyAsBuffer).not.toHaveBeenCalled()
  })

  it('CrawlerRss throws for 4xx client errors and cancels the body', async () => {
    const response = makeResponse(404, { 'content-type': 'application/rss+xml' })
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(response) as never)

    await expect(callCrawlerRss('https://example.com/missing.xml')).rejects.toThrow(Error)
    expect(response.body.cancel).toHaveBeenCalledOnce()
    expect(mockReadBodyAsBuffer).not.toHaveBeenCalled()
  })

  it('CrawlerRss preserves typed response errors from the Filaments adapter', async () => {
    const typedError = new Error('typed rate-limit error')
    mockFetchUrl.mockResolvedValueOnce(fetchUrlResult(makeResponse(429)) as never)
    mockHandleErrors.mockImplementationOnce(() => {
      throw typedError
    })

    await expect(callCrawlerRss('https://example.com/rate-limited.xml')).rejects.toBe(typedError)
    expect(mockReadBodyAsBuffer).not.toHaveBeenCalled()
  })

  it('CrawlerRss preserves typed bounded-body errors from the Filaments adapter', async () => {
    const typedError = new Error('typed response-size error')
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(makeResponse(200, { 'content-type': 'application/rss+xml' })) as never,
    )
    mockReadBodyAsBuffer.mockRejectedValueOnce(typedError)

    await expect(callCrawlerRss('https://example.com/oversized.xml')).rejects.toBe(typedError)
  })

  it('CrawlerRss tags invalid feed parse errors as permanent parseFeed failures', async () => {
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(makeResponse(200, { 'content-type': 'application/rss+xml' })) as never,
    )
    mockReadBodyAsBuffer.mockResolvedValueOnce(Buffer.from('not a feed'))

    await expect(
      callCrawlerRss('https://rss-parse-error.example.com/feed.xml'),
    ).rejects.toMatchObject({
      cause: expect.any(Error),
      tags: { operation: 'parseFeed' },
      extra: {
        rssFeedUrl: 'https://rss-parse-error.example.com/feed.xml',
        responseCode: 200,
        xmlBytes: 10,
      },
    })
    const rows = await getRssCrawlerRows('rss-parse-error.example.com')
    expect(
      rows.some(row => String(row.success) === 'false' && row.error_type === 'ParseFeedError'),
    ).toBe(true)
    expect(rows.some(row => String(row.success) === 'true')).toBe(false)
  })
})
