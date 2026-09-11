import undici from 'undici'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCrawlerHtml } from '../index.mts'
import type { CrawlerHtmlOptions } from '../types.mts'
import type { CrawlerHtmlToMarkdownOptions } from '@vouchington/crawler-html'
import * as embedResolver from '@services/crawl-embeds/embed-resolver'

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

function createReadableBody(chunks: Uint8Array[], rejectOnRead?: Error): MockBody {
  const cancel = vi.fn<() => Promise<void>>(() => Promise.resolve())
  let index = 0
  const reader = {
    read: vi.fn<() => Promise<IteratorResult<Uint8Array>>>(async () => {
      if (rejectOnRead) throw rejectOnRead
      if (index < chunks.length) {
        return { done: false, value: chunks[index++] }
      }
      return { done: true, value: undefined as never }
    }),
    cancel,
    releaseLock: vi.fn<() => void>(),
  }
  return {
    cancel,
    getReader: () => reader,
  }
}

describe('fetchCrawlerHtml content-type and response handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles 304 Not Modified responses', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(304)
    fetchSpy.mockResolvedValue(mockResponse)

    const options: CrawlerHtmlOptions = {
      url: 'https://example.com',
      lastModifiedAt: 'Mon, 01 Jan 2024 00:00:00 GMT',
    }

    const result = await fetchCrawlerHtml(options, {})

    expect(mockResponse.body?.cancel).toHaveBeenCalled()
    expect(result.response_status_code).toBe(304)
    expect(result.content).toBeUndefined()
  })

  it('handles 204 No Content responses', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(204)
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(mockResponse.body?.cancel).toHaveBeenCalled()
    expect(result.response_status_code).toBe(204)
    expect(result.content).toBeUndefined()
  })

  it('processes application/xhtml+xml content', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const html = '<html><body><h1>XHTML Test</h1></body></html>'
    const mockResponse = createResponse(
      200,
      { 'content-type': 'application/xhtml+xml; charset=utf-8' },
      createReadableBody([Buffer.from(html, 'utf-8')]),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content).toBeDefined()
    expect(result.content?.content).toContain('XHTML Test')
    expect(result.embedMetadata).toBeDefined()
  })

  it('records a successful no-embed plan as an authoritative null', async () => {
    vi.spyOn(embedResolver, 'planCrawlerEmbed').mockResolvedValueOnce(null)
    vi.spyOn(undici, 'fetch').mockResolvedValue(
      createResponse(
        200,
        { 'content-type': 'text/html' },
        createReadableBody([Buffer.from('<p>No embed</p>')]),
      ),
    )
    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})
    expect(result.embedMetadata).toBeNull()
    expect(result.embedOEmbedUrl).toBeNull()
    await result.htmlFile!.cleanup()
  })

  it('skips optional embed resolution when the caller only needs crawl metadata', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const html = '<html><body><h1>Health check</h1></body></html>'
    fetchSpy.mockResolvedValue(
      createResponse(
        200,
        { 'content-type': 'text/html; charset=utf-8' },
        createReadableBody([Buffer.from(html, 'utf-8')]),
      ),
    )

    const result = await fetchCrawlerHtml(
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', skipEmbedResolution: true },
      {},
    )

    expect(result.content?.content).toContain('Health check')
    expect(result.embedMetadata).toBeUndefined()
    expect(result.embedOEmbedUrl).toBeUndefined()
    await result.htmlFile!.cleanup()
  })

  it('decodes non-UTF-8 HTML using the response charset before processing it', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const cp1252Html = Buffer.from([
      ...Buffer.from('<html><head><title>Legacy Page</title></head><body><h1>'),
      0x93,
      ...Buffer.from('Legacy'),
      0x94,
      ...Buffer.from('</h1></body></html>'),
    ])
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html; charset=windows-1252' },
      createReadableBody([cp1252Html]),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(await readFile(result.htmlFile!.filePath)).toStrictEqual(cp1252Html)
    expect(result.content?.title).toBe('Legacy Page')
    expect(result.content?.content).toContain('“Legacy”')
    await result.htmlFile!.cleanup()
  })

  it('decodes non-UTF-8 HTML using meta charset before processing it', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const cp1252Html = Buffer.from([
      ...Buffer.from(
        '<html><head><meta charset="windows-1252"><title>Meta Charset</title></head><body><p>',
      ),
      0x93,
      ...Buffer.from('Meta'),
      0x94,
      ...Buffer.from('</p></body></html>'),
    ])
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html' },
      createReadableBody([cp1252Html]),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content?.title).toBe('Meta Charset')
    expect(result.content?.content).toContain('“Meta”')
  })

  it('falls back safely when the response declares an unsupported charset', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const html = '<html><head><title>Résumé</title></head><body><p>ok</p></body></html>'
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html; charset=unsupported-charset' },
      createReadableBody([Buffer.from(html, 'utf-8')]),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content?.title).toBe('Résumé')
  })

  it('skips text/plain content', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(200, { 'content-type': 'text/plain; charset=utf-8' })
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(mockResponse.body?.cancel).toHaveBeenCalledOnce()
    expect(result.content).toBeUndefined()
  })

  it('skips non-text content', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(200, { 'content-type': 'application/json' })
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content).toBeUndefined()
  })

  it('skips responses without a content-type header', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(200)
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content).toBeUndefined()
  })

  it('re-throws when body reading fails for HTML and cancels the locked body', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html' },
      createReadableBody([], new Error('Read failed')),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    await expect(fetchCrawlerHtml({ url: 'https://example.com' }, {})).rejects.toThrow(
      'Read failed',
    )
    expect(mockResponse.body?.cancel).toHaveBeenCalledOnce()
  })

  it('skips non-HTML content without reading the body', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const mockResponse = createResponse(200, { 'content-type': 'application/json' })
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content).toBeUndefined()
    expect(mockResponse.body?.cancel).toHaveBeenCalledOnce()
  })

  it('matches content-type values case-insensitively', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const html = '<html><body>Test</body></html>'
    const mockResponse = createResponse(
      200,
      { 'content-type': 'TEXT/HTML; charset=UTF-8' },
      createReadableBody([Buffer.from(html, 'utf-8')]),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, {})

    expect(result.content).toBeDefined()
  })

  it('passes markdown options to the Rust parser', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const html =
      '<html><body><nav>Site navigation menu links</nav><article>Test article body with multiple sentences of real prose so that the text-density filter selects this element as the main content area and not the surrounding navigation or footer boilerplate.</article><footer>Site footer copyright notice</footer></body></html>'
    const markdownOptions: CrawlerHtmlToMarkdownOptions = {
      cssSelectorsToRemove: ['nav', 'footer'],
      useTextDensityFilter: true,
    }
    const mockResponse = createResponse(
      200,
      { 'content-type': 'text/html' },
      createReadableBody([Buffer.from(html, 'utf-8')]),
    )
    fetchSpy.mockResolvedValue(mockResponse)

    const result = await fetchCrawlerHtml({ url: 'https://example.com' }, markdownOptions)

    expect(result.content).toBeDefined()
    expect(result.content?.content).toContain('Test')
  })
})
