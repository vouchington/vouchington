import undici from 'undici'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CrawlerHtml, { fetchCrawlerHtml } from '../index.mts'
import type { CrawlerHtmlOptions } from '../types.mts'

type UndiciResponse = Awaited<ReturnType<typeof undici.fetch>>

type MockBody = {
  cancel: ReturnType<typeof vi.fn<() => Promise<void>>>
  getReader?: () => {
    read: ReturnType<typeof vi.fn<() => Promise<IteratorResult<Uint8Array>>>>
    cancel: ReturnType<typeof vi.fn<() => Promise<void>>>
    releaseLock: ReturnType<typeof vi.fn<() => void>>
  }
}

function createResponse(
  status: number,
  headers: Record<string, string> = {},
  body?: MockBody,
): UndiciResponse {
  return {
    status,
    headers: new Headers(headers),
    body: body ?? { cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()) },
  } as unknown as UndiciResponse
}

function createReadableBody(html: string): MockBody {
  const bytes = Buffer.from(html, 'utf-8')
  let readOnce = false
  const reader = {
    read: vi.fn<() => Promise<IteratorResult<Uint8Array>>>(async () => {
      if (readOnce) {
        return { done: true, value: undefined as never }
      }
      readOnce = true
      return { done: false, value: bytes }
    }),
    cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    releaseLock: vi.fn<() => void>(),
  }
  return {
    cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    getReader: () => reader,
  }
}

describe('fetchCrawlerHtml headers and request options', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches HTML and processes it successfully', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const html =
      '<html><head><title>Test Page</title></head><body><h1>Test</h1><p>Content</p></body></html>'
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html; charset=utf-8' },
      createReadableBody(html),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const options: CrawlerHtmlOptions = {
      url: 'https://example.com',
    }

    const result = await fetchCrawlerHtml(options, {})

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'voucha-bot https://voucha.ai/article/voucha-bot',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        }),
      }),
    )
    expect(result.response_status_code).toBe(200)
    expect(result.content).toBeDefined()
    expect(result.content?.title).toBe('Test Page')
    expect(result.content?.content).toContain('Test')
  })

  it('records and returns a successful crawl through the service boundary', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    fetchSpy.mockResolvedValue(createResponse(304))

    const result = await CrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.response_status_code).toBe(304)
  })

  it('includes If-Modified-Since when lastModifiedAt is provided', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(304)
    fetchSpy.mockResolvedValue(mockResponse)

    await fetchCrawlerHtml(
      {
        url: 'https://example.com',
        lastModifiedAt: 'Mon, 01 Jan 2024 00:00:00 GMT',
      },
      {},
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-Modified-Since': 'Mon, 01 Jan 2024 00:00:00 GMT',
        }),
      }),
    )
  })

  it('includes If-None-Match when etag is provided', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(304)
    fetchSpy.mockResolvedValue(mockResponse)

    await fetchCrawlerHtml(
      {
        url: 'https://example.com',
        etag: '"abc123"',
      },
      {},
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-None-Match': '"abc123"',
        }),
      }),
    )
  })

  it('includes both conditional headers when provided', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(304)
    fetchSpy.mockResolvedValue(mockResponse)

    await fetchCrawlerHtml(
      {
        url: 'https://example.com',
        lastModifiedAt: 'Mon, 01 Jan 2024 00:00:00 GMT',
        etag: '"abc123"',
      },
      {},
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-Modified-Since': 'Mon, 01 Jan 2024 00:00:00 GMT',
          'If-None-Match': '"abc123"',
        }),
      }),
    )
  })

  it('uses custom timeout when provided', async () => {
    vi.useFakeTimers()
    try {
      const fetchSpy = vi.spyOn(undici, 'fetch')
      fetchSpy.mockImplementation((_url, init) => {
        const signal = init?.signal as AbortSignal | undefined
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
      })

      const handled = fetchCrawlerHtml(
        {
          url: 'https://example.com',
          requestTimeoutMs: 1,
        },
        {},
      ).catch(error => error)
      await vi.advanceTimersByTimeAsync(1)
      await expect(await handled).toMatchObject({ message: 'aborted' })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses custom maxResponseSizeBytes when provided', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html' },
      createReadableBody('<html><body>123456</body></html>'),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    await expect(
      fetchCrawlerHtml(
        {
          url: 'https://example.com',
          maxResponseSizeBytes: 5,
        },
        {},
      ),
    ).rejects.toThrow('Response size exceeded limit: 32 > 5 bytes for https://example.com')
  })

  it('includes response headers in the result', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(
      200,
      {
        'content-type': 'text/html',
        etag: '"abc123"',
        'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
      },
      createReadableBody('<html><body>Headers</body></html>'),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.response_headers).toEqual({
      'content-type': 'text/html',
      etag: '"abc123"',
      'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
    })
  })

  it('includes request headers in the result', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(304)
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml(
      {
        url: 'https://example.com',
        lastModifiedAt: 'Mon, 01 Jan 2024 00:00:00 GMT',
        etag: '"abc123"',
      },
      {},
    )

    expect(result.request_headers).toEqual({
      'User-Agent': 'voucha-bot https://voucha.ai/article/voucha-bot',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'If-Modified-Since': 'Mon, 01 Jan 2024 00:00:00 GMT',
      'If-None-Match': '"abc123"',
    })
  })

  it('includes crawl timestamps in the result', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(304)
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.crawl_started_at).toBeInstanceOf(Date)
    expect(result.crawl_completed_at).toBeInstanceOf(Date)
    expect(result.crawl_completed_at.getTime()).toBeGreaterThanOrEqual(
      result.crawl_started_at.getTime(),
    )
  })
})
