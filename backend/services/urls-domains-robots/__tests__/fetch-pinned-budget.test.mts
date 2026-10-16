import {
  cancelResponseBody,
  type fetchWithTimeout as fetchWithTimeoutFn,
} from '@modules/utils/http'
import type { validateUrl as validateUrlFn } from 'ssrf-guard/node'
import { describe, expect, it, vi } from 'vitest'
import { fetchPinnedRobotsTxt } from '../fetch-pinned.mts'

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

function robotsHttpResponse(status: number): Response {
  return {
    status,
    statusText: 'OK',
    headers: new Headers(),
    body: {} as Response['body'],
  } as Response
}

describe('fetchPinnedRobotsTxt budget edges', () => {
  it('rejects before DNS when the chain budget is already gone', async () => {
    const start = 1_700_000_000_000
    let calls = 0
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      calls += 1
      return calls === 1 ? start : start + 10_000
    })
    const validateUrl = vi.fn<ValidateUrlFn>()

    try {
      await expect(
        fetchPinnedRobotsTxt('https://example.com/robots.txt', 10_000, {
          validateUrl,
          fetchWithTimeout: vi.fn<FetchWithTimeoutFn>(),
          unsafeUrlError: TestUnsafeUrlError,
          cancelResponseBody: vi.fn<CancelResponseBodyFn>(),
        }),
      ).rejects.toMatchObject({ name: 'TimeoutError' })
      expect(validateUrl).not.toHaveBeenCalled()
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('maps a non-error abort reason to TimeoutError', async () => {
    const response = robotsHttpResponse(200)
    const controller = new AbortController()
    controller.abort('stopped')
    const cancelResponseBody = vi.fn<CancelResponseBodyFn>()

    await expect(
      fetchPinnedRobotsTxt('https://example.com/robots.txt', 10_000, {
        validateUrl: vi.fn<ValidateUrlFn>().mockResolvedValue(PUBLIC_ADDRESSES),
        fetchWithTimeout: vi.fn<FetchWithTimeoutFn>().mockResolvedValue({
          response,
          responseSignal: controller.signal,
        }),
        unsafeUrlError: TestUnsafeUrlError,
        cancelResponseBody,
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError', message: 'robots.txt fetch timed out' })
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
  })
})
