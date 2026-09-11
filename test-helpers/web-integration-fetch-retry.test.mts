import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FetchResponseRejectedError,
  fetchWithTransportRetry,
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
    const resultRejection = result.catch((error: unknown) => error)
    await vi.runAllTimersAsync()

    await expect(resultRejection).resolves.toBeInstanceOf(FetchResponseRejectedError)
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })
})
