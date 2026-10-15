import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FetchResponseRejectedError,
  fetchWithTransportRetry,
  retryOnTransportError,
} from '../integration-tests/web/helpers/fetch-retry.mts'

function makeResponse(body: BodyInit | null, init: ResponseInit & { url?: string } = {}): Response {
  const { url, ...responseInit } = init
  const response = new Response(body, responseInit)
  if (url) Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('web-integration fetch retry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('retries rejected idempotent responses and returns the original accepted response', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn<(reason?: unknown) => void>()
    const rejected = makeResponse(
      new ReadableStream({
        cancel,
        start(controller) {
          controller.enqueue(new TextEncoder().encode('restart banner'))
        },
      }),
    )
    const accepted = makeResponse('final response', {
      headers: { 'x-request-id': 'request-123' },
      url: 'https://worker.example/final',
    })
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(accepted)
    vi.stubGlobal('fetch', fetchMock)

    const result = fetchWithTransportRetry(
      'https://worker.example/retry',
      {},
      {
        label: '/retry',
        method: 'GET',
        acceptResponse: response => response.headers.has('x-request-id'),
      },
    )
    await vi.advanceTimersByTimeAsync(250)

    await expect(result).resolves.toBe(accepted)
    expect(await accepted.text()).toBe('final response')
    expect(accepted.url).toBe('https://worker.example/final')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('returns valid non-success responses unchanged', async () => {
    const accepted = makeResponse('not found', {
      headers: { 'x-request-id': 'request-404' },
      status: 404,
      url: 'https://worker.example/missing',
    })
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(accepted)
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchWithTransportRetry(
      'https://worker.example/missing',
      {},
      {
        label: '/missing',
        method: 'GET',
        acceptResponse: response => response.headers.has('x-request-id'),
      },
    )

    expect(result).toBe(accepted)
    expect(result.status).toBe(404)
    expect(await result.text()).toBe('not found')
    expect(result.url).toBe('https://worker.example/missing')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not retry rejected non-idempotent responses', async () => {
    const rejected = makeResponse('restart banner', {
      status: 503,
      statusText: 'Worker restarting',
      url: 'https://worker.example/mutation',
    })
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(rejected)
    vi.stubGlobal('fetch', fetchMock)

    const result = fetchWithTransportRetry(
      'https://worker.example/mutation',
      {},
      {
        label: '/mutation',
        method: 'POST',
        acceptResponse: response => response.headers.has('x-request-id'),
      },
    )

    await expect(result).rejects.toMatchObject({
      name: 'FetchResponseRejectedError',
      status: 503,
      statusText: 'Worker restarting',
      url: 'https://worker.example/mutation',
    })
    await expect(result).rejects.toThrow('503 Worker restarting')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('starts rejected-body cancellation without waiting for it before retrying', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn<() => Promise<never>>(() => new Promise<never>(() => {}))
    const rejected = makeResponse(new ReadableStream({ cancel }))
    const accepted = makeResponse('final response', { headers: { 'x-request-id': 'request-123' } })
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(accepted)
    vi.stubGlobal('fetch', fetchMock)

    const result = fetchWithTransportRetry(
      'https://worker.example/retry',
      {},
      {
        label: '/retry',
        method: 'GET',
        acceptResponse: response => response.headers.has('x-request-id'),
      },
    )
    await vi.advanceTimersByTimeAsync(250)

    await expect(result).resolves.toBe(accepted)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('exhausts the existing retry schedule for repeated rejected responses', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(makeResponse('restart banner'))
    vi.stubGlobal('fetch', fetchMock)

    const result = fetchWithTransportRetry(
      'https://worker.example/retry',
      {},
      {
        label: '/retry',
        method: 'GET',
        acceptResponse: response => response.headers.has('x-request-id'),
      },
    )
    const resultRejection = result.catch((err: unknown) => err)
    const attemptTimes: number[] = [Date.now()]
    fetchMock.mockImplementation(async () => {
      attemptTimes.push(Date.now())
      return makeResponse('restart banner')
    })
    const started = Date.now()
    await vi.advanceTimersByTimeAsync(5_750)

    await expect(resultRejection).resolves.toBeInstanceOf(FetchResponseRejectedError)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(attemptTimes.map(time => time - started)).toEqual([0, 250, 750, 1_750, 3_750, 5_750])
  })

  it('preserves operation context and the original final transport failure across all backoffs', async () => {
    vi.useFakeTimers()
    const context = new AsyncLocalStorage<object>()
    const owner = {}
    const err = new Error('owned connection reset', { cause: { code: 'ECONNRESET' } })
    const started = Date.now()
    const attempts: number[] = []
    const result = context.run(owner, () =>
      retryOnTransportError(
        async () => {
          expect(context.getStore()).toBe(owner)
          attempts.push(Date.now() - started)
          throw err
        },
        { idempotent: true, label: 'owned operation' },
      ),
    )
    const rejection = result.catch((err: unknown) => err)
    await vi.advanceTimersByTimeAsync(5_750)
    expect(await rejection).toBe(err)
    expect(attempts).toEqual([0, 250, 750, 1_750, 3_750, 5_750])
  })

  it('propagates an unknown operation failure without scheduling a retry', async () => {
    vi.useFakeTimers()
    const err = new Error('application failure')
    const attempt = vi.fn<() => Promise<never>>().mockRejectedValue(err)
    await expect(
      retryOnTransportError(attempt, { idempotent: true, label: 'owned operation' }),
    ).rejects.toBe(err)
    expect(attempt).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
