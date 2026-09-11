import undici from 'undici'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CrawlerHtml from '../index.mts'
import { CrawlerNetworkError, CrawlerTimeoutError } from '@modules/on-error/errors'

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
})
