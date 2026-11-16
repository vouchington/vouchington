import { describe, expect, it, vi } from 'vitest'
import { handleErrors, readBodyAsBuffer } from '@services/crawler-utils'
import CrawlerRss from './index.mts'

const fetched = (response: Response, responseSignal: AbortSignal) => ({
  response,
  responseSignal,
})

const callRss = (response: Response, responseSignal = new AbortController().signal) =>
  CrawlerRss('https://example.com/feed.xml', {
    timeoutMs: 100,
    dependencies: {
      fetchUrl: vi.fn<VitestLooseMock>().mockResolvedValue(fetched(response, responseSignal)),
      readBodyAsBuffer,
      handleErrors,
    },
  })

describe('RSS crawler response body lifecycle', () => {
  it.each([429, 503, 404])('cancels an ignored %i body before rejecting', async status => {
    const cancel = vi.fn<() => void>()
    const body = new ReadableStream<Uint8Array>({ cancel })

    await expect(callRss(new Response(body, { status }))).rejects.toMatchObject({ status })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('bounds a successful feed whose body stalls after headers', async () => {
    const cancel = vi.fn<() => void>()
    let pulls = 0
    const stalled = Promise.withResolvers<void>()
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls === 1) {
          controller.enqueue(Buffer.from('<?xml version="1.0"?><rss version="2.0"><channel>'))
          return undefined
        }
        // Second pull: the first chunk was consumed and the reader is waiting on more data.
        stalled.resolve()
        return new Promise<void>(() => {})
      },
      cancel,
    })
    const deadline = new AbortController()
    const pending = callRss(
      new Response(body, { headers: { 'content-type': 'application/rss+xml' } }),
      deadline.signal,
    )
    const outcome = pending.catch((err: unknown) => err)
    await stalled.promise
    expect(deadline.signal.aborted).toBe(false)
    deadline.abort(new DOMException('deadline', 'AbortError'))

    expect(await outcome).toMatchObject({ name: 'CrawlerTimeoutError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })
})
