import { afterEach, beforeEach, expect, it, vi, describe } from 'vitest'
import {
  CrawlerNetworkError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import { type validateUrl as validateSafeUrl } from 'ssrf-guard/node'
import { fetchUrl } from './index.mts'

class TestUnsafeUrlError extends Error {
  rawUrl: string
  reason: string
  constructor(rawUrl: string, reason: string) {
    super(`Unsafe URL: ${reason} (${rawUrl})`)
    this.name = 'UnsafeUrlError'
    this.rawUrl = rawUrl
    this.reason = reason
  }
}

const mockValidateUrl = vi.fn<typeof validateSafeUrl>()
const mockFetchWithTimeout = vi.fn<VitestLooseMock>()

const makeDependencies = () => ({
  validateUrl: mockValidateUrl,
  unsafeUrlError: TestUnsafeUrlError,
  fetchWithTimeout: mockFetchWithTimeout,
})

describe('index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetchUrl validates and pins resolved addresses before fetching', async () => {
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    const response = new Response('ok', { status: 200 })
    const responseSignal = new AbortController().signal
    const abortController = new AbortController()
    mockValidateUrl.mockResolvedValueOnce(resolvedAddresses)
    mockFetchWithTimeout.mockResolvedValueOnce({ response, responseSignal })

    await expect(
      fetchUrl({
        url: 'https://example.com/feed.xml',
        headers: { Accept: 'application/rss+xml' },
        timeoutMs: 5000,
        signal: abortController.signal,
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).resolves.toEqual({ response, responseSignal })

    expect(mockValidateUrl).toHaveBeenCalledWith('https://example.com/feed.xml', {
      timeoutMs: expect.any(Number),
    })
    const [, validateOptions] = mockValidateUrl.mock.calls[0]!
    expect(validateOptions?.timeoutMs).toBeGreaterThan(0)
    expect(validateOptions?.timeoutMs).toBeLessThanOrEqual(5000)
    expect(mockFetchWithTimeout).toHaveBeenCalledOnce()
    const [fetchOptions] = mockFetchWithTimeout.mock.calls[0]!
    expect(fetchOptions).toMatchObject({
      url: 'https://example.com/feed.xml',
      headers: { Accept: 'application/rss+xml' },
      resolvedAddresses,
      signal: abortController.signal,
    })
    expect(fetchOptions.requestTimeoutMs).toBeGreaterThan(0)
    expect(fetchOptions.requestTimeoutMs).toBeLessThanOrEqual(5000)
    expect(fetchOptions.responseTimeoutMs).toBe(fetchOptions.requestTimeoutMs)
  })

  it('fetchUrl wraps UnsafeUrlError as CrawlerSsrfError without wrapping as CrawlerNetworkError', async () => {
    mockValidateUrl.mockRejectedValueOnce(
      new TestUnsafeUrlError('https://10.0.0.1/feed.xml', 'private IP'),
    )

    await expect(
      fetchUrl({
        url: 'https://10.0.0.1/feed.xml',
        headers: {},
        timeoutMs: 5000,
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).rejects.toBeInstanceOf(CrawlerSsrfError)

    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })

  it('fetchUrl wraps DNS validation failures as crawler network errors', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), {
      code: 'ENOTFOUND',
    })
    mockValidateUrl.mockRejectedValueOnce(dnsError)

    await expect(
      fetchUrl({
        url: 'https://example.com/feed.xml',
        headers: {},
        timeoutMs: 5000,
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).rejects.toBeInstanceOf(CrawlerNetworkError)

    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })

  it('fetchUrl rethrows non-Error validation failures after tracking them as unknown', async () => {
    mockValidateUrl.mockRejectedValueOnce('boom')

    await expect(
      fetchUrl({
        url: 'https://example.com/feed.xml',
        headers: {},
        timeoutMs: 5000,
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).rejects.toBe('boom')

    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })

  it('fetchUrl wraps DNS validation timeouts as crawler timeouts', async () => {
    const timeoutError = new Error('DNS lookup for example.com timed out after 5000ms')
    timeoutError.name = 'AbortError'
    mockValidateUrl.mockRejectedValueOnce(timeoutError)

    await expect(
      fetchUrl({
        url: 'https://example.com/feed.xml',
        headers: {},
        timeoutMs: 5000,
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).rejects.toBeInstanceOf(CrawlerTimeoutError)

    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })

  it('fetchUrl maps deadline signal timeouts to crawler timeouts', async () => {
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    const timeoutError = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    )
    mockValidateUrl.mockResolvedValueOnce(resolvedAddresses)
    mockFetchWithTimeout.mockRejectedValueOnce(timeoutError)

    await expect(
      fetchUrl({
        url: 'https://example.com/feed.xml',
        headers: {},
        timeoutMs: 5000,
        signal: AbortSignal.timeout(5000),
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).rejects.toBeInstanceOf(CrawlerTimeoutError)
  })

  it('fetchUrl wraps ssrf-guard DNS timeout errors as crawler timeouts', async () => {
    const timeoutError = createSsrfGuardTimeoutError()
    mockValidateUrl.mockRejectedValueOnce(timeoutError)

    await expect(
      fetchUrl({
        url: 'https://example.com/feed.xml',
        headers: {},
        timeoutMs: 5000,
        crawlerType: 'rss',
        startedAt: new Date(),
        dependencies: makeDependencies(),
      }),
    ).rejects.toBeInstanceOf(CrawlerTimeoutError)

    expect(timeoutError.name).toBe('AbortError')
    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })

  it('fetchUrl passes only the remaining timeout budget to DNS validation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:03.000Z'))
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    mockValidateUrl.mockResolvedValueOnce(resolvedAddresses)
    mockFetchWithTimeout.mockResolvedValueOnce({
      response: new Response('ok', { status: 200 }),
      responseSignal: new AbortController().signal,
    })

    await fetchUrl({
      url: 'https://example.com/feed.xml',
      headers: {},
      timeoutMs: 5000,
      crawlerType: 'rss',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      dependencies: makeDependencies(),
    })

    expect(mockValidateUrl).toHaveBeenCalledWith('https://example.com/feed.xml', {
      timeoutMs: 2000,
    })
  })

  it('fetchUrl passes only the remaining timeout budget to the HTTP fetch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    const resolution = Promise.withResolvers<typeof resolvedAddresses>()
    mockValidateUrl.mockReturnValueOnce(resolution.promise)
    mockFetchWithTimeout.mockResolvedValueOnce({
      response: new Response('ok', { status: 200 }),
      responseSignal: new AbortController().signal,
    })

    const promise = fetchUrl({
      url: 'https://example.com/feed.xml',
      headers: {},
      timeoutMs: 5000,
      crawlerType: 'rss',
      startedAt: new Date(),
      dependencies: makeDependencies(),
    })

    await vi.advanceTimersByTimeAsync(3000)
    resolution.resolve(resolvedAddresses)
    await promise

    expect(mockFetchWithTimeout).toHaveBeenCalledWith({
      url: 'https://example.com/feed.xml',
      headers: {},
      requestTimeoutMs: 2000,
      responseTimeoutMs: 2000,
      resolvedAddresses,
    })
  })
})

function createSsrfGuardTimeoutError(): Error {
  const error = new Error('DNS lookup for example.com timed out after 0ms')
  error.name = 'AbortError'
  return error
}
