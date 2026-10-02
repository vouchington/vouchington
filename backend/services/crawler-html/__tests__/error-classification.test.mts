import undici from 'undici'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CrawlerHtml from '../index.mts'
import {
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerTimeoutError,
  HttpNoBodyError,
  HttpRateLimitError,
  HttpResponseSizeError,
  HttpServerError,
} from '@modules/on-error/errors'

// `undici.fetch` aborted by `AbortSignal.timeout()` rejects with a `DOMException` named
// `TimeoutError`, not `AbortError`. `CrawlerHtml`'s catch block must classify both names as a
// crawler timeout (504 / 'timeout'); anything else falls through to `CrawlerNetworkError`
// (502 / null), which silently drops the fact that the request timed out at all.
describe('CrawlerHtml timeout classification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('classifies a real fetch timeout (DOMException named TimeoutError) as CrawlerTimeoutError', async () => {
    vi.spyOn(undici, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    )

    const error = await CrawlerHtml(
      { url: 'https://example.com', requestTimeoutMs: 1234 },
      {},
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(CrawlerTimeoutError)
    expect(error).toMatchObject({ status: 504, url: 'https://example.com' })
  })

  it('classifies a stream-pipeline abort (Error named AbortError) as CrawlerTimeoutError', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.spyOn(undici, 'fetch').mockRejectedValue(abortError)

    const error = await CrawlerHtml(
      { url: 'https://example.com', requestTimeoutMs: 1234 },
      {},
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(CrawlerTimeoutError)
    expect(error).toMatchObject({ status: 504, url: 'https://example.com' })
  })

  it('still classifies a genuine non-timeout error as CrawlerNetworkError', async () => {
    vi.spyOn(undici, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.com'))

    const error = await CrawlerHtml({ url: 'https://example.com' }, {}).catch(
      (thrown: unknown) => thrown,
    )

    expect(error).toBeInstanceOf(CrawlerNetworkError)
    expect(error).toMatchObject({ status: 502 })
  })

  it('preserves the upstream retry delay when classifying a rate limit', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValue(
      new undici.Response(null, { status: 429, headers: { 'retry-after': '3' } }),
    )

    const err = await CrawlerHtml({ url: 'https://example.com' }, {}).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(CrawlerRateLimitError)
    expect(err).toMatchObject({ status: 429, retryAfterMs: 3000, url: 'https://example.com' })
    expect((err as CrawlerRateLimitError).cause).toBeInstanceOf(HttpRateLimitError)
  })

  it('preserves the upstream status when classifying a server failure', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValue(new undici.Response(null, { status: 503 }))

    const err = await CrawlerHtml({ url: 'https://example.com' }, {}).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(CrawlerServerError)
    expect(err).toMatchObject({ status: 503, url: 'https://example.com' })
    expect((err as CrawlerServerError).cause).toBeInstanceOf(HttpServerError)
  })

  it('reports the actual bytes and configured limit when an HTML response is too large', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValue(
      new undici.Response('12345', { headers: { 'content-type': 'text/html' } }),
    )

    const err = await CrawlerHtml(
      { url: 'https://example.com', maxResponseSizeBytes: 4 },
      {},
    ).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(CrawlerResponseSizeExceededError)
    expect(err).toMatchObject({ status: 413, size: 5, maxSize: 4, url: 'https://example.com' })
    expect((err as CrawlerResponseSizeExceededError).cause).toBeInstanceOf(HttpResponseSizeError)
  })

  it('preserves a missing HTML response body as its distinct transport error', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValue(
      new undici.Response(null, { headers: { 'content-type': 'text/html' } }),
    )

    const err = await CrawlerHtml({ url: 'https://example.com' }, {}).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(HttpNoBodyError)
    expect(err).toMatchObject({ code: 'HTTP_NO_BODY', status: 502 })
  })

  it('propagates an unknown provider rejection without changing its identity', async () => {
    const failure = { reason: 'provider unavailable' }
    vi.spyOn(undici, 'fetch').mockRejectedValue(failure)

    await expect(CrawlerHtml({ url: 'https://example.com' }, {})).rejects.toBe(failure)
  })
})
