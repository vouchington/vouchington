import { afterEach, describe, expect, it, vi } from 'vitest'
import { restoreGlobals } from '../test-helpers/src/mock-env.mts'
import { fetchOriginResponse } from './origin-request.mts'

const metadata = {
  botTier: null,
  countryCode: null,
  requestId: 'request-id',
  target: 'web' as const,
}

function connectionLost(): Error {
  return Object.assign(new Error('Network connection lost.'), { retryable: true })
}

describe('fetchOriginResponse connection loss', () => {
  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('returns the first idempotent response without a second fetch', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('chunk', { status: 200 }))
    globalThis.fetch = fetchMock

    const result = await fetchOriginResponse(
      new Request('https://web.example/_next/static/chunks/app.js'),
      metadata,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect('response' in result).toBe(true)
    if (!('response' in result)) return
    expect(result.response.status).toBe(200)
  })

  it.each(['GET', 'HEAD'])(
    'returns the recovered response after one dropped %s connection',
    async method => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(connectionLost())
        .mockResolvedValueOnce(new Response('chunk', { status: 200 }))
      globalThis.fetch = fetchMock

      const result = await fetchOriginResponse(
        new Request('https://web.example/_next/static/chunks/app.js', { method }),
        metadata,
      )

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect('response' in result).toBe(true)
      if (!('response' in result)) return
      expect(result.response.status).toBe(200)
      expect(await result.response.text()).toBe('chunk')
    },
  )

  it('returns 502 when the idempotent retry also loses the connection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(connectionLost())
    globalThis.fetch = fetchMock

    const result = await fetchOriginResponse(
      new Request('https://web.example/_next/static/chunks/app.js'),
      metadata,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('Origin fetch failed:', expect.any(Error))
  })

  it('does not retry a mutating request when the origin socket drops', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(connectionLost())
    globalThis.fetch = fetchMock

    const result = await fetchOriginResponse(
      new Request('https://web.example/api/v1/bookmarks/rss_feed_item/item/save', {
        method: 'POST',
      }),
      metadata,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('does not retry an idempotent fetch that fails for another reason', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('origin unavailable'))
    globalThis.fetch = fetchMock

    const result = await fetchOriginResponse(
      new Request('https://web.example/_next/static/chunks/app.js'),
      metadata,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-Error rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue('Network connection lost.')
    globalThis.fetch = fetchMock

    const result = await fetchOriginResponse(
      new Request('https://web.example/_next/static/chunks/app.js'),
      metadata,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
