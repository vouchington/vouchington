import {
  cancelResponseBody,
  type fetchWithTimeout as fetchWithTimeoutFn,
} from '@modules/utils/http'
import { isNetworkError } from '@vouchington/http-transport/fetch'
import type { validateUrl as validateUrlFn } from 'ssrf-guard/node'
import { describe, expect, it, vi } from 'vitest'
import { fetchPinnedRobotsTxt, RobotsUnsafeTargetError } from '../fetch-pinned.mts'

type FetchWithTimeoutFn = typeof fetchWithTimeoutFn
type ValidateUrlFn = typeof validateUrlFn
type CancelResponseBodyFn = typeof cancelResponseBody

const PUBLIC_ADDRESSES = [{ address: '93.184.216.34', family: 4 as const }]

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

function robotsHttpResponse(status: number, headers: Record<string, string> = {}): Response {
  return {
    status,
    statusText: status === 200 ? 'OK' : 'Redirect',
    headers: new Headers(headers),
    body: {} as Response['body'],
  } as Response
}

function dependencies(overrides: {
  validateUrl: ReturnType<typeof vi.fn<ValidateUrlFn>>
  fetchWithTimeout: ReturnType<typeof vi.fn<FetchWithTimeoutFn>>
  cancelResponseBody?: ReturnType<typeof vi.fn<CancelResponseBodyFn>>
}) {
  return {
    validateUrl: overrides.validateUrl,
    fetchWithTimeout: overrides.fetchWithTimeout,
    unsafeUrlError: TestUnsafeUrlError,
    cancelResponseBody: overrides.cancelResponseBody ?? vi.fn<CancelResponseBodyFn>(),
  }
}

describe('fetchPinnedRobotsTxt', () => {
  it('does not fetch a host that fails SSRF validation', async () => {
    const fetchWithTimeout = vi.fn<FetchWithTimeoutFn>()
    const validateUrl = vi
      .fn<ValidateUrlFn>()
      .mockRejectedValue(
        new TestUnsafeUrlError(
          'https://evil.test/robots.txt',
          'IP address is private: 169.254.169.254',
        ),
      )

    await expect(
      fetchPinnedRobotsTxt('https://evil.test/robots.txt', 10_000, {
        ...dependencies({ validateUrl, fetchWithTimeout }),
      }),
    ).rejects.toBeInstanceOf(RobotsUnsafeTargetError)

    expect(validateUrl).toHaveBeenCalledWith('https://evil.test/robots.txt', { timeoutMs: 5000 })
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('reports a DNS timeout as a retryable TimeoutError without fetching', async () => {
    const timeout = new Error('DNS lookup for slow.test timed out after 5000ms')
    timeout.name = 'AbortError'
    const fetchWithTimeout = vi.fn<FetchWithTimeoutFn>()
    const validateUrl = vi.fn<ValidateUrlFn>().mockRejectedValue(timeout)

    const rejection = fetchPinnedRobotsTxt(
      'https://slow.test/robots.txt',
      10_000,
      dependencies({ validateUrl, fetchWithTimeout }),
    )

    await expect(rejection).rejects.toMatchObject({ name: 'TimeoutError' })
    await expect(rejection).rejects.toSatisfy((err: unknown) => isNetworkError(err))
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('leaves a DNS lookup failure retryable', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND missing.test'), {
      code: 'ENOTFOUND',
    })
    const fetchWithTimeout = vi.fn<FetchWithTimeoutFn>()
    const validateUrl = vi.fn<ValidateUrlFn>().mockRejectedValue(dnsError)

    await expect(
      fetchPinnedRobotsTxt(
        'https://missing.test/robots.txt',
        10_000,
        dependencies({ validateUrl, fetchWithTimeout }),
      ),
    ).rejects.toBe(dnsError)

    expect(isNetworkError(dnsError)).toBe(true)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('pins every redirect hop', async () => {
    const firstAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    const secondAddresses = [{ address: '93.184.216.35', family: 4 as const }]
    const redirect = robotsHttpResponse(302, { location: 'https://cdn.example/robots.txt' })
    const ok = robotsHttpResponse(200)
    const validateUrl = vi
      .fn<ValidateUrlFn>()
      .mockResolvedValueOnce(firstAddresses)
      .mockResolvedValueOnce(secondAddresses)
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValueOnce({ response: redirect, responseSignal: AbortSignal.timeout(10_000) })
      .mockResolvedValueOnce({ response: ok, responseSignal: AbortSignal.timeout(10_000) })
    const cancelResponseBody = vi.fn<CancelResponseBodyFn>()

    const pinned = await fetchPinnedRobotsTxt(
      'https://example.com/robots.txt',
      10_000,
      dependencies({ validateUrl, fetchWithTimeout, cancelResponseBody }),
    )

    expect(pinned.response).toBe(ok)
    expect(pinned.bodySignal.aborted).toBe(false)
    expect(validateUrl).toHaveBeenNthCalledWith(1, 'https://example.com/robots.txt', {
      timeoutMs: 5000,
    })
    expect(validateUrl).toHaveBeenNthCalledWith(2, 'https://cdn.example/robots.txt', {
      timeoutMs: 5000,
    })
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: 'https://example.com/robots.txt',
        resolvedAddresses: firstAddresses,
      }),
    )
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: 'https://cdn.example/robots.txt',
        resolvedAddresses: secondAddresses,
      }),
    )
    expect(cancelResponseBody).toHaveBeenCalledWith(redirect)
  })

  it('does not fetch a redirect that resolves to a private address', async () => {
    const redirect = robotsHttpResponse(301, { location: 'https://169.254.169.254/robots.txt' })
    const validateUrl = vi
      .fn<ValidateUrlFn>()
      .mockResolvedValueOnce(PUBLIC_ADDRESSES)
      .mockRejectedValueOnce(
        new TestUnsafeUrlError(
          'https://169.254.169.254/robots.txt',
          'IP address is private: 169.254.169.254',
        ),
      )
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValueOnce({ response: redirect, responseSignal: AbortSignal.timeout(10_000) })

    await expect(
      fetchPinnedRobotsTxt(
        'https://evil.test/robots.txt',
        10_000,
        dependencies({ validateUrl, fetchWithTimeout }),
      ),
    ).rejects.toBeInstanceOf(RobotsUnsafeTargetError)

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(validateUrl).toHaveBeenCalledTimes(2)
  })

  it('rejects a non-http redirect target before another fetch', async () => {
    const redirect = robotsHttpResponse(302, { location: 'javascript:alert(1)' })
    const validateUrl = vi.fn<ValidateUrlFn>().mockResolvedValue(PUBLIC_ADDRESSES)
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValueOnce({ response: redirect, responseSignal: AbortSignal.timeout(10_000) })

    await expect(
      fetchPinnedRobotsTxt(
        'https://example.com/robots.txt',
        10_000,
        dependencies({ validateUrl, fetchWithTimeout }),
      ),
    ).rejects.toBeInstanceOf(RobotsUnsafeTargetError)

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(validateUrl).toHaveBeenCalledTimes(1)
  })

  it('resolves a relative redirect against the current robots.txt URL', async () => {
    const validateUrl = vi.fn<ValidateUrlFn>().mockResolvedValue(PUBLIC_ADDRESSES)
    const redirect = robotsHttpResponse(302, { location: 'moved.txt' })
    const ok = robotsHttpResponse(200)
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValueOnce({ response: redirect, responseSignal: AbortSignal.timeout(10_000) })
      .mockResolvedValueOnce({ response: ok, responseSignal: AbortSignal.timeout(10_000) })

    const pinned = await fetchPinnedRobotsTxt(
      'https://example.com/robots.txt',
      10_000,
      dependencies({ validateUrl, fetchWithTimeout }),
    )

    expect(pinned.response).toBe(ok)
    expect(pinned.bodySignal.aborted).toBe(false)
    expect(validateUrl).toHaveBeenNthCalledWith(2, 'https://example.com/moved.txt', {
      timeoutMs: 5000,
    })
  })

  it('stops after five redirects and returns the leftover redirect', async () => {
    const validateUrl = vi.fn<ValidateUrlFn>().mockResolvedValue(PUBLIC_ADDRESSES)
    const fetchWithTimeout = vi.fn<FetchWithTimeoutFn>()
    const cancelResponseBody = vi.fn<CancelResponseBodyFn>()
    for (let hop = 0; hop <= 5; hop++) {
      fetchWithTimeout.mockResolvedValueOnce({
        response: robotsHttpResponse(302, {
          location: `https://hop-${hop + 1}.example/robots.txt`,
        }),
        responseSignal: AbortSignal.timeout(10_000),
      })
    }

    const pinned = await fetchPinnedRobotsTxt(
      'https://hop-0.example/robots.txt',
      10_000,
      dependencies({ validateUrl, fetchWithTimeout, cancelResponseBody }),
    )

    expect(pinned.response.status).toBe(302)
    expect(pinned.bodySignal.aborted).toBe(false)
    expect(fetchWithTimeout).toHaveBeenCalledTimes(6)
    expect(validateUrl).toHaveBeenLastCalledWith('https://hop-5.example/robots.txt', {
      timeoutMs: 5000,
    })
    expect(validateUrl).not.toHaveBeenCalledWith('https://hop-6.example/robots.txt', {
      timeoutMs: 5000,
    })
    expect(cancelResponseBody).toHaveBeenCalledTimes(6)
  })

  it('rejects a body that arrives after the chain deadline', async () => {
    const start = 1_700_000_000_000
    let now = start
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const response = robotsHttpResponse(200)
    const validateUrl = vi.fn<ValidateUrlFn>().mockResolvedValue(PUBLIC_ADDRESSES)
    const fetchWithTimeout = vi.fn<FetchWithTimeoutFn>().mockImplementation(async () => {
      now = start + 10_000
      return { response, responseSignal: AbortSignal.timeout(10_000) }
    })
    const cancelResponseBody = vi.fn<CancelResponseBodyFn>()

    const rejection = fetchPinnedRobotsTxt(
      'https://example.com/robots.txt',
      10_000,
      dependencies({ validateUrl, fetchWithTimeout, cancelResponseBody }),
    )

    await expect(rejection).rejects.toMatchObject({ name: 'TimeoutError' })
    await expect(rejection).rejects.toSatisfy((err: unknown) => isNetworkError(err))
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    nowSpy.mockRestore()
  })
})
