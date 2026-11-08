import dns from 'node:dns'
import * as http from '@modules/utils/http'
import { validateUrl } from 'ssrf-guard/node'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
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

// Wraps the real ssrf-guard validateUrl so calls are recorded while validation stays real.
vi.mock(import('ssrf-guard/node'), async importOriginal => {
  const original = await importOriginal()
  return { ...original, validateUrl: vi.fn<VitestLooseMock>(original.validateUrl) }
})

describe('well-known', () => {
  let fetchWithTimeout: MockInstance<typeof http.fetchWithTimeout>
  let dnsLookup: MockInstance<(hostname: string) => Promise<unknown>>

  beforeEach(() => {
    vi.mocked(validateUrl).mockClear()
    fetchWithTimeout = vi.spyOn(http, 'fetchWithTimeout')
    dnsLookup = vi.spyOn(dns.promises, 'lookup') as unknown as typeof dnsLookup
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns the token and pins the validated addresses on a successful 200 response', async () => {
    const token = 'voucha-site-verification=abc123XYZ'
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeTextResponse(`${token}\n`)))

    const result = await fetchWellKnownToken('example.com')

    expect(result).toBe(token)
    expect(validateUrl).toHaveBeenCalledOnce()
    expect(validateUrl).toHaveBeenCalledWith(
      'https://example.com/.well-known/voucha-verification.txt',
      { timeoutMs: 5000 },
    )
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
    expect(fetchWithTimeout.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://example.com/.well-known/voucha-verification.txt',
      requestTimeoutMs: 10000,
      responseTimeoutMs: 10000,
      resolvedAddresses: [{ address: '93.184.216.34', family: 4 }],
    })
  })

  it('returns null on a 404 response', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeTextResponse('Not Found', 404)),
    )

    expect(await fetchWellKnownToken('example.com')).toBeNull()
  })

  it('returns null when fetch throws (network error / timeout)', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('network error'))

    expect(await fetchWellKnownToken('example.com')).toBeNull()
  })

  it('returns null without fetching when the host resolves to a private address', async () => {
    dnsLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])

    const result = await fetchWellKnownToken('internal.example.com')

    expect(result).toBeNull()
    expect(validateUrl).toHaveBeenCalledOnce()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('returns null without fetching for a loopback IP literal', async () => {
    const result = await fetchWellKnownToken('127.0.0.1')

    expect(result).toBeNull()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('returns null without transport for an invalid hostname', async () => {
    const result = await fetchWellKnownToken('not a hostname')

    expect(result).toBeNull()
    expect(validateUrl).not.toHaveBeenCalled()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('returns null when body is empty or whitespace-only', async () => {
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeTextResponse('   \n')))

    expect(await fetchWellKnownToken('example.com')).toBeNull()
  })

  it('returns null when the response body exceeds the verification limit', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeTextResponse('x'.repeat(4097))),
    )

    expect(await fetchWellKnownToken('example.com')).toBeNull()
  })

  it('returns null when a body stream yields a non-byte chunk', async () => {
    const body = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('not bytes')
        controller.close()
      },
    })
    const response = new Response()
    Object.defineProperty(response, 'body', { value: body })
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(response))

    await expect(fetchWellKnownToken('example.com')).resolves.toBeNull()
  })

  it('never throws when DNS resolution times out — resolves null like any other lookup failure', async () => {
    dnsLookup.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    const result = await fetchWellKnownToken('example.com')

    expect(result).toBeNull()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('reports a failed aborted-body cancellation while preserving the null verification outcome', async () => {
    const cancellationError = new Error('reader cancellation failed')
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    fetchWithTimeout.mockResolvedValueOnce(abortedFetchWithRejectedCancellation(cancellationError))

    await expect(fetchWellKnownToken('example.com')).resolves.toBeNull()
    await new Promise<void>(queueMicrotask)

    expect(reportError).toHaveBeenCalledWith(cancellationError)
  })
})
