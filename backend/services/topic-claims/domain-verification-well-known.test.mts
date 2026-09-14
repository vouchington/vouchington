import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsafeUrlError } from 'ssrf-guard/node'
import { fetchWellKnownToken } from './domain-verification-well-known.mts'

function makeTextResponse(body: string, status = 200): Response {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(body)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(stream, { status })
}

/** Wraps a fake response in the `{ response, responseSignal }` pair `fetchWithTimeout` now resolves. */
function fetchWithTimeoutResult(response: Response) {
  return { response, responseSignal: new AbortController().signal }
}

function abortedFetchWithRejectedCancellation(error: Error) {
  const controller = new AbortController()
  controller.abort()
  return {
    response: new Response(
      new ReadableStream({
        cancel() {
          return Promise.reject(error)
        },
      }),
    ),
    responseSignal: controller.signal,
  }
}

describe('well-known', () => {
  const fetchWithTimeout = vi.fn<VitestLooseMock>()
  const validateUrl = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    validateUrl.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function dependencies() {
    return { fetchWithTimeout, validateUrl }
  }

  it('returns the token on a successful 200 response', async () => {
    const token = 'voucha-site-verification=abc123XYZ'
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeTextResponse(`${token}\n`)))

    const result = await fetchWellKnownToken('example.com', dependencies())

    expect(result).toBe(token)
    expect(validateUrl).toHaveBeenCalledOnce()
  })

  it('returns null on a 404 response', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeTextResponse('Not Found', 404)),
    )

    const result = await fetchWellKnownToken('example.com', dependencies())

    expect(result).toBeNull()
  })

  it('returns null when fetch throws (network error / timeout)', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('network error'))

    const result = await fetchWellKnownToken('example.com', dependencies())

    expect(result).toBeNull()
  })

  it('returns null without fetching when the URL is SSRF-unsafe', async () => {
    validateUrl.mockRejectedValueOnce(
      new UnsafeUrlError('https://internal.local/', 'IP address is private'),
    )

    const result = await fetchWellKnownToken('internal.local', dependencies())

    expect(result).toBeNull()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('returns null without transport for an invalid hostname', async () => {
    const result = await fetchWellKnownToken('not a hostname', dependencies())

    expect(result).toBeNull()
    expect(validateUrl).not.toHaveBeenCalled()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('returns null when body is empty or whitespace-only', async () => {
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeTextResponse('   \n')))

    const result = await fetchWellKnownToken('example.com', dependencies())

    expect(result).toBeNull()
  })

  it('returns null when the response body exceeds the verification limit', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeTextResponse('x'.repeat(4097))),
    )

    const result = await fetchWellKnownToken('example.com', dependencies())

    expect(result).toBeNull()
  })

  it('bounds DNS/SSRF resolution with a timeoutMs option', async () => {
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeTextResponse('token\n')))

    await fetchWellKnownToken('example.com', dependencies())

    const [, options] = validateUrl.mock.calls[0] as [string, { timeoutMs: number }]
    expect(options.timeoutMs).toBeGreaterThan(0)
  })

  it('never throws when DNS resolution times out — resolves null like any other lookup failure', async () => {
    validateUrl.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    const result = await fetchWellKnownToken('example.com', dependencies())

    expect(result).toBeNull()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('reports a failed aborted-body cancellation while preserving the null verification outcome', async () => {
    const cancellationError = new Error('reader cancellation failed')
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    fetchWithTimeout.mockResolvedValueOnce(abortedFetchWithRejectedCancellation(cancellationError))

    await expect(fetchWellKnownToken('example.com', dependencies())).resolves.toBeNull()
    await new Promise<void>(queueMicrotask)

    expect(reportError).toHaveBeenCalledWith(cancellationError)
  })
})
