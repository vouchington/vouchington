import undici from 'undici'
import { WikimediaDecodeError, WikimediaHttpError } from '@vouchington/wikimedia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enableApiEgressGuardrail,
  getExternalRequestDispatcher,
  resetHttpDispatchersForTest,
} from '@modules/utils/http-dispatchers'
import { getWikipediaSummary, searchWikipediaByTitle } from './api.mts'

const USER_AGENT = 'VouchaTopicRecommender/1.0 (https://voucha.ai)'

describe('Wikipedia API facade', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await resetHttpDispatchersForTest()
  })

  it('uses the guarded upstream client and preserves search results', async () => {
    const fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        undici.Response.json({ pages: [{ id: 18923154, title: 'TypeScript' }] }),
      )

    await expect(searchWikipediaByTitle('TypeScript', 1)).resolves.toEqual([
      { title: 'TypeScript', pageid: 18923154 },
    ])
    expect(fetch).toHaveBeenCalledWith(
      'https://api.wikimedia.org/core/v1/wikipedia/en/search/title?q=TypeScript&limit=1',
      expect.objectContaining({
        dispatcher: getExternalRequestDispatcher(),
        headers: { 'user-agent': USER_AGENT },
        redirect: 'manual',
      }),
    )
  })

  it('resolves the guarded dispatcher when each request starts', async () => {
    const unguardedDispatcher = getExternalRequestDispatcher()
    enableApiEgressGuardrail()
    const guardedDispatcher = getExternalRequestDispatcher()
    const fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        undici.Response.json({ pages: [{ id: 18923154, title: 'TypeScript' }] }),
      )

    expect(guardedDispatcher).not.toBe(unguardedDispatcher)
    await expect(searchWikipediaByTitle('TypeScript', 1)).resolves.toEqual([
      { title: 'TypeScript', pageid: 18923154 },
    ])
    expect(fetch).toHaveBeenCalledWith(
      'https://api.wikimedia.org/core/v1/wikipedia/en/search/title?q=TypeScript&limit=1',
      expect.objectContaining({ dispatcher: guardedDispatcher }),
    )
  })

  it('maps upstream summary fields to the legacy snake_case shape', async () => {
    const fetch = vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      undici.Response.json({
        pageid: 18923154,
        title: 'TypeScript',
        extract: 'A programming language.',
        description: 'programming language',
        thumbnail: { source: 'https://example.com/typescript.png' },
      }),
    )

    await expect(getWikipediaSummary('TypeScript')).resolves.toEqual({
      pageid: 18923154,
      title: 'TypeScript',
      url: 'https://en.wikipedia.org/wiki/TypeScript',
      extract: 'A programming language.',
      description: 'programming language',
      thumbnail_url: 'https://example.com/typescript.png',
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://en.wikipedia.org/api/rest_v1/page/summary/TypeScript',
      expect.objectContaining({
        dispatcher: getExternalRequestDispatcher(),
        headers: { 'user-agent': USER_AGENT },
        redirect: 'manual',
      }),
    )
  })

  it('keeps missing summaries nullable', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 404 }))

    await expect(getWikipediaSummary('Missing article')).resolves.toBeNull()
  })

  it('retries 5xx responses then maps the terminal upstream error', async () => {
    const fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValue(new undici.Response(null, { status: 503 }))

    await expect(searchWikipediaByTitle('TypeScript')).rejects.toMatchObject({
      status: 503,
      message: 'Wikipedia search failed: 503',
      cause: expect.any(WikimediaHttpError),
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('retries rate-limited responses according to Retry-After', async () => {
    const fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        new undici.Response(null, { status: 429, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(
        undici.Response.json({ pages: [{ id: 18923154, title: 'TypeScript' }] }),
      )

    await expect(searchWikipediaByTitle('TypeScript', 1)).resolves.toEqual([
      { title: 'TypeScript', pageid: 18923154 },
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry 4xx responses and keeps the original status in the error', async () => {
    const fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(new undici.Response(null, { status: 403 }))

    await expect(getWikipediaSummary('Restricted article')).rejects.toMatchObject({
      status: 403,
      message: 'Wikipedia summary failed: 403',
      cause: expect.any(WikimediaHttpError),
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('maps redirects to the legacy 500 status while retaining the original response status', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 301 }))

    await expect(searchWikipediaByTitle('TypeScript')).rejects.toMatchObject({
      status: 500,
      message: 'Wikipedia search failed: 301',
      cause: expect.any(WikimediaHttpError),
    })
  })

  it('propagates strict upstream decode failures', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(undici.Response.json({ pages: [{}] }))

    await expect(searchWikipediaByTitle('TypeScript')).rejects.toBeInstanceOf(WikimediaDecodeError)
  })

  it('propagates cancellation without retrying', async () => {
    const aborted = new DOMException('The operation was aborted.', 'AbortError')
    const fetch = vi.spyOn(undici, 'fetch').mockRejectedValue(aborted)

    await expect(getWikipediaSummary('TypeScript')).rejects.toBe(aborted)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('retries retryable network failures and preserves the terminal error', async () => {
    const networkError = Object.assign(new TypeError('fetch failed'), { code: 'ECONNRESET' })
    const fetch = vi.spyOn(undici, 'fetch').mockRejectedValue(networkError)

    await expect(searchWikipediaByTitle('TypeScript')).rejects.toBe(networkError)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
