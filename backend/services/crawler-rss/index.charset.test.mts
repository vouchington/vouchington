import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import CrawlerRss from './index.mts'

const mockFetchUrl = vi.fn<VitestLooseMock>()
const mockReadBodyAsBuffer = vi.fn<VitestLooseMock>()
const mockHandleErrors = vi.fn<VitestLooseMock>()

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

describe('CrawlerRss charset decoding', () => {
  it('parses legacy-encoded RSS feeds using the declared response charset', async () => {
    const xml =
      '<?xml version="1.0"?><rss><channel><title>Feed</title><item><link>https://example.com/1</link><guid>1</guid><title>café</title></item></channel></rss>'
    const xmlBuffer = Buffer.from(xml, 'latin1')
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(
        makeResponse(200, {
          'content-type': 'application/rss+xml; charset=iso-8859-1',
        }),
      ) as never,
    )
    mockReadBodyAsBuffer.mockResolvedValueOnce(xmlBuffer)
    mockHandleErrors.mockReturnValueOnce(undefined)

    const result = await CrawlerRss('https://charset.example.com/feed.xml', {
      dependencies: {
        fetchUrl: mockFetchUrl,
        readBodyAsBuffer: mockReadBodyAsBuffer,
        handleErrors: mockHandleErrors,
      },
    })

    expect(result.feed).toMatchObject({
      items: [expect.objectContaining({ title: 'café' })],
    })
    expect(result.contentSha256).toEqual(createHash('sha256').update(xmlBuffer).digest())
  })

  it('preserves valid text around malformed bytes in explicitly UTF-8 feeds', async () => {
    const prefix = Buffer.from('<?xml version="1.0" encoding="utf-8"?><rss><channel><title>Résumé ')
    const suffix = Buffer.from('</title></channel></rss>')
    const feedBuffer = Buffer.concat([prefix, Buffer.from([0x93]), suffix])
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(
        makeResponse(200, { 'content-type': 'application/rss+xml; charset=utf-8' }),
      ) as never,
    )
    mockReadBodyAsBuffer.mockResolvedValueOnce(feedBuffer)
    mockHandleErrors.mockReturnValueOnce(undefined)

    const result = await CrawlerRss('https://charset.example.com/malformed.xml', {
      dependencies: {
        fetchUrl: mockFetchUrl,
        readBodyAsBuffer: mockReadBodyAsBuffer,
        handleErrors: mockHandleErrors,
      },
    })

    expect(result.feed).toMatchObject({ title: 'Résumé �' })
    expect(result.contentSha256).toEqual(createHash('sha256').update(feedBuffer).digest())
  })

  it('decodes JSON feeds as UTF-8 when the response declares a stale charset', async () => {
    const jsonFeed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Résumé Feed',
      home_page_url: 'https://example.com',
      feed_url: 'https://example.com/feed.json',
      items: [
        {
          id: 'item-1',
          url: 'https://example.com/1',
          title: 'Résumé Item',
          content_text: 'Example item',
        },
      ],
    })
    const feedBuffer = Buffer.from(jsonFeed, 'utf8')
    mockFetchUrl.mockResolvedValueOnce(
      fetchUrlResult(
        makeResponse(200, { 'content-type': 'application/feed+json; charset=iso-8859-1' }),
      ) as never,
    )
    mockReadBodyAsBuffer.mockResolvedValueOnce(feedBuffer)
    mockHandleErrors.mockReturnValueOnce(undefined)

    const result = await CrawlerRss('https://charset.example.com/feed.json', {
      dependencies: {
        fetchUrl: mockFetchUrl,
        readBodyAsBuffer: mockReadBodyAsBuffer,
        handleErrors: mockHandleErrors,
      },
    })

    expect(result.feed).toMatchObject({
      title: 'Résumé Feed',
      items: [expect.objectContaining({ title: 'Résumé Item' })],
    })
    expect(result.contentSha256).toEqual(createHash('sha256').update(feedBuffer).digest())
  })
})
