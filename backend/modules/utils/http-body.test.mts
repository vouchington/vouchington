import { describe, expect, it } from 'vitest'
import { Response as UndiciResponse } from 'undici'
import { readResponseBody } from './http.mts'

describe('readResponseBody response compatibility', () => {
  it('preserves native response bodies without a compatibility bridge', async () => {
    const response = new Response('native response')
    const body = response.body
    if (!body) throw new Error('expected native response body')
    const getReader = body.getReader
    let getReaderCalls = 0
    Object.defineProperty(body, 'getReader', {
      value: () => {
        getReaderCalls += 1
        return getReader.call(body)
      },
    })

    await expect(
      readResponseBody({
        response,
        url: 'https://example.com',
        maxSizeBytes: 1000,
      }),
    ).resolves.toBe('native response')
    expect(response.bodyUsed).toBe(true)
    expect(getReaderCalls).toBe(1)
  })

  it('cancels an Undici response body when the caller aborts', async () => {
    const abortController = new AbortController()
    const reason = new Error('stop reading')
    let cancelReason: unknown
    const response = new UndiciResponse(
      new ReadableStream<Uint8Array>({
        cancel(value) {
          cancelReason = value
        },
      }),
    )

    const readPromise = readResponseBody({
      response,
      url: 'https://example.com',
      maxSizeBytes: 1000,
      signal: abortController.signal,
    })
    abortController.abort(reason)

    await expect(readPromise).rejects.toThrow('stop reading')
    expect(cancelReason).toBe(reason)
  })
})
