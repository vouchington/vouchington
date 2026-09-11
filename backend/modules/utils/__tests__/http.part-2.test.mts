import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import undici from 'undici'
import { handleHttpErrors, fetchWithTimeout, fetchWithTimeoutSimple } from '../http.mts'
import { HttpRateLimitError, HttpServerError } from '../../on-error/errors.mts'
import { getExternalRequestDispatcher, getPinnedRequestDispatcher } from '../http-dispatchers.mts'

describe('handleHttpErrors', () => {
  function makeResponse(status: number, headers: Record<string, string> = {}): Response {
    return {
      status,
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
      body: { cancel: vi.fn<VitestLooseMock>() },
    } as unknown as Response
  }

  it('throws HttpRateLimitError for 429', () => {
    const response = makeResponse(429, { 'retry-after': '60' })
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpRateLimitError,
    )
  })

  it('preserves the rate-limit error when body cancellation rejects', async () => {
    const response = makeResponse(429, { 'retry-after': '60' })
    const cancel = response.body?.cancel
    if (!cancel) throw new Error('Expected response body cancel mock')
    vi.mocked(cancel).mockRejectedValueOnce(new Error('cancel failed'))

    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpRateLimitError,
    )
    await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('throws HttpRateLimitError with parsed retryAfterMs', () => {
    const response = makeResponse(429, { 'retry-after': '30' })
    let error: HttpRateLimitError | undefined
    try {
      handleHttpErrors({ response, url: 'https://example.com' })
    } catch (e) {
      error = e as HttpRateLimitError
    }
    expect(error?.retryAfterMs).toBe(30_000)
  })

  it('throws HttpRateLimitError with null retryAfterMs when no Retry-After header', () => {
    const response = makeResponse(429)
    let error: HttpRateLimitError | undefined
    try {
      handleHttpErrors({ response, url: 'https://example.com' })
    } catch (e) {
      error = e as HttpRateLimitError
    }
    expect(error?.retryAfterMs).toBeNull()
  })

  it('throws HttpServerError for 500', () => {
    const response = makeResponse(500)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpServerError,
    )
  })

  it('throws HttpServerError for 502', () => {
    const response = makeResponse(502)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpServerError,
    )
  })

  it('throws HttpServerError for 503', () => {
    const response = makeResponse(503)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpServerError,
    )
  })

  it('does not throw for 200', () => {
    const response = makeResponse(200)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).not.toThrow()
  })

  it('does not throw for 301', () => {
    const response = makeResponse(301)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).not.toThrow()
  })

  it('does not throw for 404', () => {
    const response = makeResponse(404)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).not.toThrow()
  })
})

describe('fetchWithTimeout - DNS pinning', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => vi.useRealTimers())

  it('passes dispatcher option when resolvedAddresses is provided', async () => {
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    const fetchSpy = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>,
      )

    await fetchWithTimeout({
      url: 'https://example.com/',
      headers: {},
      requestTimeoutMs: 5000,
      responseTimeoutMs: 5000,
      resolvedAddresses,
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[1]?.dispatcher).toBe(getPinnedRequestDispatcher(resolvedAddresses))
  })

  it('combines a caller abort signal with the local timeout signal', async () => {
    const abortController = new AbortController()
    const fetchSpy = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>,
      )

    await fetchWithTimeout({
      url: 'https://example.com/',
      headers: {},
      requestTimeoutMs: 5000,
      responseTimeoutMs: 5000,
      signal: abortController.signal,
    })
    const requestSignal = fetchSpy.mock.calls[0]?.[1]?.signal
    const reason = new Error('caller aborted')
    abortController.abort(reason)

    expect(requestSignal?.aborted).toBe(true)
    expect(requestSignal?.reason).toBe(reason)
  })

  it('passes the shared external dispatcher when resolvedAddresses is omitted', async () => {
    const fetchSpy = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>,
      )

    await fetchWithTimeout({
      url: 'https://example.com/',
      headers: {},
      requestTimeoutMs: 5000,
      responseTimeoutMs: 5000,
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[1]?.dispatcher).toBe(getExternalRequestDispatcher())
  })

  it('clears the request timer once headers arrive, leaving the response phase unaffected', async () => {
    const fetchDelayMs = 30
    const requestTimeoutMs = 10
    vi.useFakeTimers()
    let resolveFetch!: (response: Awaited<ReturnType<typeof undici.fetch>>) => void
    const fetchSpy = vi.spyOn(undici, 'fetch').mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      }),
    )

    // requestTimeoutMs elapses before the mocked fetch settles, but the mock ignores its abort
    // signal — so this proves the request timer's expiry, once headers/response have arrived,
    // cannot reach into the returned response or its independent response-phase signal.
    const result = fetchWithTimeout({
      url: 'https://example.com/',
      headers: {},
      requestTimeoutMs,
      responseTimeoutMs: 5000,
    })
    await vi.advanceTimersByTimeAsync(fetchDelayMs)
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    resolveFetch(new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>)
    const { response, responseSignal } = await result

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(responseSignal.aborted).toBe(false)
  })

  it('arms the response-phase timeout independently, starting only once headers arrive', async () => {
    const responseTimeoutMs = 5
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>,
    )

    const { responseSignal } = await fetchWithTimeout({
      url: 'https://example.com/',
      headers: {},
      requestTimeoutMs: 5000,
      responseTimeoutMs,
    })

    expect(responseSignal.aborted).toBe(false)
    await new Promise<void>(resolve => {
      responseSignal.addEventListener('abort', () => resolve(), { once: true })
    })
    expect(responseSignal.reason).toMatchObject({ name: 'TimeoutError' })
  })

  it('passes the shared external dispatcher for fetchWithTimeoutSimple', async () => {
    const fetchSpy = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>,
      )

    await fetchWithTimeoutSimple('https://example.com/', 5000)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[1]?.dispatcher).toBe(getExternalRequestDispatcher())
  })

  it('distinguishes the local timeout signal from a caller abort', async () => {
    const fetchSpy = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValueOnce(
        new Response('ok', { status: 200 }) as Awaited<ReturnType<typeof undici.fetch>>,
      )

    await fetchWithTimeoutSimple('https://example.com/', 1)
    const requestSignal = fetchSpy.mock.calls[0]?.[1]?.signal
    if (!requestSignal) throw new Error('Expected request timeout signal')
    if (!requestSignal.aborted) {
      await new Promise<void>(resolve => {
        requestSignal.addEventListener('abort', () => resolve(), { once: true })
      })
    }

    expect(requestSignal.reason).toMatchObject({ name: 'TimeoutError' })
  })
})
