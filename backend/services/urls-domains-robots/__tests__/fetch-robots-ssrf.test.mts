import {
  cancelResponseBody,
  isNetworkError,
  isRetryableError,
  readResponseBody,
  fetchWithTimeoutSimple,
  type fetchWithTimeout,
} from '@modules/utils/http'
import type { validateUrl } from 'ssrf-guard/node'
import { describe, expect, it, vi } from 'vitest'
import { RobotsUnsafeTargetError } from '../fetch-pinned.mts'
import { fetchRobotsTxt } from '../index.mts'

const ALLOW_ROBOTS_TXT = 'User-agent: *\nAllow: /'
const DISALLOW_ROBOTS_TXT = 'User-agent: *\nDisallow: /'
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

describe('fetchRobotsTxt SSRF policy', () => {
  it('returns disallow immediately when the robots.txt target is unsafe', async () => {
    const readResponseBody = vi.fn<typeof readResponseBody>()
    const fetchWithTimeoutSimple = vi.fn<typeof fetchWithTimeoutSimple>(async () => {
      throw new RobotsUnsafeTargetError('https://unsafe.test/robots.txt', 'private IP')
    })

    await expect(
      fetchRobotsTxt('unsafe.test', {
        checkDomainBlacklisted: async () => false,
        fetchWithTimeoutSimple,
        readResponseBody,
        isNetworkError,
        isRetryableError,
      }),
    ).resolves.toBe(DISALLOW_ROBOTS_TXT)

    expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
    expect(fetchWithTimeoutSimple).toHaveBeenCalledWith('https://unsafe.test/robots.txt', 10_000)
    expect(readResponseBody).not.toHaveBeenCalled()
  })

  it('does not fetch a robots.txt host that resolves to a private address', async () => {
    const fetchWithTimeout = vi.fn<typeof fetchWithTimeout>()
    const validateUrl = vi
      .fn<typeof validateUrl>()
      .mockRejectedValue(
        new TestUnsafeUrlError(
          'https://evil.test/robots.txt',
          'IP address is private: 169.254.169.254',
        ),
      )

    await expect(
      fetchRobotsTxt('evil.test', {
        checkDomainBlacklisted: async () => false,
        validateUrl,
        fetchWithTimeout,
        unsafeUrlError: TestUnsafeUrlError,
        isNetworkError,
        isRetryableError,
      }),
    ).resolves.toBe(DISALLOW_ROBOTS_TXT)

    expect(validateUrl).toHaveBeenCalledWith('https://evil.test/robots.txt', { timeoutMs: 5000 })
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('allows the domain after DNS timeouts are exhausted', async () => {
    const timeout = new Error('DNS lookup for slow.test timed out after 5000ms')
    timeout.name = 'AbortError'
    const fetchWithTimeout = vi.fn<typeof fetchWithTimeout>()
    const validateUrl = vi.fn<typeof validateUrl>().mockRejectedValue(timeout)

    await expect(
      fetchRobotsTxt('slow.test', {
        checkDomainBlacklisted: async () => false,
        validateUrl,
        fetchWithTimeout,
        unsafeUrlError: TestUnsafeUrlError,
        isNetworkError,
        isRetryableError,
      }),
    ).resolves.toBe(ALLOW_ROBOTS_TXT)

    expect(validateUrl).toHaveBeenCalledTimes(3)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('pins a redirect and reads the final body as the original robots.txt URL', async () => {
    const redirect = robotsHttpResponse(302, { location: 'https://cdn.example/robots.txt' })
    const ok = robotsHttpResponse(200)
    const validateUrl = vi
      .fn<typeof validateUrl>()
      .mockResolvedValueOnce(PUBLIC_ADDRESSES)
      .mockResolvedValueOnce([{ address: '93.184.216.35', family: 4 as const }])
    const fetchWithTimeout = vi
      .fn<typeof fetchWithTimeout>()
      .mockResolvedValueOnce({ response: redirect, responseSignal: AbortSignal.timeout(10_000) })
      .mockResolvedValueOnce({ response: ok, responseSignal: AbortSignal.timeout(10_000) })
    const readResponseBody = vi
      .fn<typeof readResponseBody>()
      .mockResolvedValue('User-agent: *\nDisallow: /private\n')

    await expect(
      fetchRobotsTxt('example.com', {
        checkDomainBlacklisted: async () => false,
        validateUrl,
        fetchWithTimeout,
        unsafeUrlError: TestUnsafeUrlError,
        cancelResponseBody: vi.fn<typeof cancelResponseBody>(),
        readResponseBody,
        isNetworkError,
        isRetryableError,
      }),
    ).resolves.toBe('User-agent: *\nDisallow: /private\n')

    expect(readResponseBody).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/robots.txt',
        response: ok,
      }),
    )
  })

  it('keeps an injected fetch on the two-argument timeout contract', async () => {
    const fetchWithTimeoutSimple = vi
      .fn<typeof fetchWithTimeoutSimple>()
      .mockResolvedValue(robotsHttpResponse(200))
    const validateUrl = vi.fn<typeof validateUrl>()
    const readResponseBody = vi.fn<typeof readResponseBody>().mockResolvedValue(ALLOW_ROBOTS_TXT)

    await expect(
      fetchRobotsTxt('example.com', {
        checkDomainBlacklisted: async () => false,
        fetchWithTimeoutSimple,
        validateUrl,
        readResponseBody,
        isNetworkError,
        isRetryableError,
      }),
    ).resolves.toBe(ALLOW_ROBOTS_TXT)

    expect(fetchWithTimeoutSimple).toHaveBeenCalledWith('https://example.com/robots.txt', 10_000)
    expect(validateUrl).not.toHaveBeenCalled()
  })
})
