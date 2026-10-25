import * as http from '@modules/utils/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCrawlerHtml } from '../index.mts'

const fetched = (
  response: Response,
  responseSignal: AbortSignal = new AbortController().signal,
) => ({
  response,
  responseSignal,
})

describe('HTML crawler response body lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([301, 302, 303, 307, 308])(
    'returns redirect %i metadata without waiting for its stalled HTML body',
    async status => {
      const cancel = vi.fn<() => void>()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from('<html>Redirecting'))
        },
        cancel,
      })
      vi.spyOn(http, 'fetchWithTimeout').mockResolvedValueOnce(
        fetched(
          new Response(body, {
            status,
            headers: { 'content-type': 'text/html', location: '/destination' },
          }),
        ),
      )

      const result = await fetchCrawlerHtml(
        { url: 'https://example.com/source', responseTimeoutMs: 100 },
        {},
      )

      expect(result.response_status_code).toBe(status)
      expect(result.response_headers.location).toBe('/destination')
      expect(result.content).toBeUndefined()
      expect(result.htmlFile).toBeUndefined()
      expect(cancel).toHaveBeenCalledOnce()
      expect(body.locked).toBe(false)
    },
  )

  it('still bounds a successful HTML response whose body stalls after headers', async () => {
    const cancel = vi.fn<() => void>()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('<html>Incomplete'))
      },
      cancel,
    })
    vi.spyOn(http, 'fetchWithTimeout').mockResolvedValueOnce(
      fetched(
        new Response(body, { headers: { 'content-type': 'text/html' } }),
        AbortSignal.timeout(100),
      ),
    )

    await expect(
      fetchCrawlerHtml({ url: 'https://example.com/', responseTimeoutMs: 100 }, {}),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('preserves HTML processing when a redirect has no Location', async () => {
    vi.spyOn(http, 'fetchWithTimeout').mockResolvedValueOnce(
      fetched(
        new Response('<html><head><title>Missing Location</title></head></html>', {
          status: 302,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )

    const result = await fetchCrawlerHtml(
      { url: 'https://example.com/', skipEmbedResolution: true },
      {},
    )
    try {
      expect(result.content?.title).toBe('Missing Location')
      expect(result.htmlFile?.byteLength).toBeGreaterThan(0)
    } finally {
      await result.htmlFile?.cleanup()
    }
  })

  it.each([429, 503])('cancels an ignored %i body before rejecting', async status => {
    const cancel = vi.fn<() => void>()
    const body = new ReadableStream<Uint8Array>({ cancel })
    vi.spyOn(http, 'fetchWithTimeout').mockResolvedValueOnce(
      fetched(new Response(body, { status })),
    )

    await expect(fetchCrawlerHtml({ url: 'https://example.com/' }, {})).rejects.toMatchObject({
      status,
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })
})
