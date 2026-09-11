import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fetchImageFromUrl } from './client.mts'
import { HttpOperationError } from '../errors.mts'

const mockFetchWithPinnedDns = vi.fn<VitestLooseMock>()

function imageResponse(options: {
  body?: string | Buffer
  contentType?: string
  contentLength?: string
  etag?: string
  ok?: boolean
  status?: number
  statusText?: string
}) {
  const bodyBytes = Buffer.isBuffer(options.body)
    ? options.body
    : Buffer.from(options.body ?? 'image data')
  const cancel = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    body: {
      cancel,
      async *[Symbol.asyncIterator]() {
        yield bodyBytes
      },
    },
    headers: {
      get: (name: string) => {
        if (name === 'etag') return options.etag ?? null
        if (name === 'content-type') return options.contentType ?? 'image/jpeg'
        if (name === 'content-length') return options.contentLength ?? null
        return null
      },
    },
  }
}

describe('fetchImageFromUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockFetchWithPinnedDns.mockResolvedValue(imageResponse({}) as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should fetch image successfully', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ body: 'image data', etag: '"abc123"' }) as never,
    )

    const result = await fetchImageFromUrl('https://example.com/image.jpg', undefined, undefined, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    })

    try {
      expect((await readFile(result.file!.path)).toString()).toBe('image data')
      expect(result.etag).toBe('"abc123"')
      expect(result.contentType).toBe('image/jpeg')
    } finally {
      await result.file!.cleanup()
    }
    expect(mockFetchWithPinnedDns).toHaveBeenCalledWith(
      new URL('https://example.com/image.jpg'),
      expect.any(AbortSignal),
    )
  })

  it('should handle missing etag', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ body: 'image data', contentType: 'image/png' }) as never,
    )

    const result = await fetchImageFromUrl('https://example.com/image.jpg', undefined, undefined, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    })

    try {
      expect((await readFile(result.file!.path)).toString()).toBe('image data')
      expect(result.etag).toBe('')
      expect(result.contentType).toBe('image/png')
    } finally {
      await result.file!.cleanup()
    }
  })

  it('should throw HttpOperationError on 404', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ ok: false, status: 404, statusText: 'Not Found' }) as never,
    )

    const err404 = await fetchImageFromUrl(
      'https://example.com/missing.jpg',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    ).catch(e => e)
    expect(err404).toBeInstanceOf(HttpOperationError)
    expect((err404 as HttpOperationError).statusCode).toBe(404)
  })

  it('should throw HttpOperationError on 500', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ ok: false, status: 500, statusText: 'Internal Server Error' }) as never,
    )

    const err500 = await fetchImageFromUrl('https://example.com/error.jpg', undefined, undefined, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    }).catch(e => e)
    expect(err500).toBeInstanceOf(HttpOperationError)
    expect((err500 as HttpOperationError).statusCode).toBe(500)
  })

  it('should handle abort errors as timeouts', async () => {
    const abortError = new Error('AbortError')
    abortError.name = 'AbortError'

    mockFetchWithPinnedDns.mockRejectedValue(abortError)

    const errAbort = await fetchImageFromUrl('https://example.com/slow.jpg', 1000, undefined, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    }).catch(e => e)
    expect(errAbort).toBeInstanceOf(HttpOperationError)
    expect((errAbort as HttpOperationError).statusCode).toBe(504)
    expect(() => {
      throw errAbort
    }).toThrow('timeout')
  })

  it('should handle network errors', async () => {
    mockFetchWithPinnedDns.mockRejectedValue(new Error('Network error'))

    const errNetwork = await fetchImageFromUrl(
      'https://example.com/image.jpg',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    ).catch(e => e)
    expect(errNetwork).toBeInstanceOf(HttpOperationError)
    expect((errNetwork as HttpOperationError).statusCode).toBe(500)
    expect(() => {
      throw errNetwork
    }).toThrow('Network error')
  })

  it('should pass timeout to abort controller', async () => {
    await fetchImageFromUrl('https://example.com/image.jpg', 5000, undefined, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    })

    expect(mockFetchWithPinnedDns).toHaveBeenCalledWith(
      new URL('https://example.com/image.jpg'),
      expect.any(AbortSignal),
    )
  })

  it('should reject invalid content type', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(imageResponse({ contentType: 'text/html' }) as never)

    const errContentType = await fetchImageFromUrl(
      'https://example.com/page.html',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    ).catch(e => e)
    expect(errContentType).toBeInstanceOf(HttpOperationError)
    expect((errContentType as HttpOperationError).statusCode).toBe(415)
    expect(() => {
      throw errContentType
    }).toThrow('Invalid content type')
  })

  it('should reject image larger than max size', async () => {
    const largeData = Buffer.alloc(100 * 1024 * 1024)
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({
        body: largeData,
        contentLength: '104857600',
      }) as never,
    )

    const errTooLarge = await fetchImageFromUrl(
      'https://example.com/large.jpg',
      30000,
      10 * 1024 * 1024,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    ).catch(e => e)
    expect(errTooLarge).toBeInstanceOf(HttpOperationError)
    expect((errTooLarge as HttpOperationError).statusCode).toBe(413)
    expect(() => {
      throw errTooLarge
    }).toThrow('Image too large')
  })

  it('should handle content-type with charset', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ body: 'image data', contentType: 'image/jpeg; charset=utf-8' }) as never,
    )

    const result = await fetchImageFromUrl('https://example.com/image.jpg', undefined, undefined, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    })

    expect(result.contentType).toBe('image/jpeg')
  })

  it('should accept and canonicalize image/jpg (non-standard CDN alias) as image/jpeg', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ body: 'image data', contentType: 'image/jpg' }) as never,
    )

    const result = await fetchImageFromUrl(
      'https://cdn.example.com/photo.jpg',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    )

    expect(result.contentType).toBe('image/jpeg')
  })

  it('should accept and canonicalize image/pjpeg as image/jpeg', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ body: 'image data', contentType: 'image/pjpeg' }) as never,
    )

    const result = await fetchImageFromUrl(
      'https://cdn.example.com/photo.jpg',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    )

    expect(result.contentType).toBe('image/jpeg')
  })

  it('should accept and canonicalize image/x-png as image/png', async () => {
    mockFetchWithPinnedDns.mockResolvedValue(
      imageResponse({ body: 'image data', contentType: 'image/x-png' }) as never,
    )

    const result = await fetchImageFromUrl(
      'https://cdn.example.com/photo.png',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    )

    expect(result.contentType).toBe('image/png')
  })

  it('should re-throw HttpOperationError from fetchWithPinnedDns', async () => {
    mockFetchWithPinnedDns.mockRejectedValue(new HttpOperationError('URL host is not allowed', 403))

    const err = await fetchImageFromUrl(
      'https://blocked.example.com/image.jpg',
      undefined,
      undefined,
      { fetchWithPinnedDns: mockFetchWithPinnedDns },
    ).catch(e => e)
    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
  })
})
