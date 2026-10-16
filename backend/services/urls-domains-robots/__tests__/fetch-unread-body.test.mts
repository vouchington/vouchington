import {
  cancelResponseBody as cancelResponseBodyFn,
  readResponseBody as readResponseBodyFn,
  type fetchWithTimeoutSimple as fetchWithTimeoutSimpleFn,
} from '@modules/utils/http'
import { describe, expect, it, vi } from 'vitest'
import { defaultRobotsDependencies, fetchRobotsTxtWithRetry } from '../fetch-retry.mts'

type CancelResponseBodyFn = typeof cancelResponseBodyFn
type ReadResponseBodyFn = typeof readResponseBodyFn
type FetchWithTimeoutSimpleFn = typeof fetchWithTimeoutSimpleFn

const ALLOW_ROBOTS_TXT = 'User-agent: *\nAllow: /'

function ignoredRobotsResponse(status: number, statusText: string): Response {
  return {
    status,
    statusText,
    headers: new Headers(),
    body: { cancel: async () => undefined },
  } as Response
}

function retryDependencies(
  fetchWithTimeoutSimple: ReturnType<typeof vi.fn<FetchWithTimeoutSimpleFn>>,
) {
  const cancelResponseBody = vi.fn<CancelResponseBodyFn>()
  const readResponseBody = vi.fn<ReadResponseBodyFn>()
  return {
    dependencies: {
      ...defaultRobotsDependencies,
      fetchWithTimeoutSimple,
      cancelResponseBody,
      readResponseBody,
      checkDomainBlacklisted: async () => false,
      isNetworkError: () => false,
      isRetryableError: () => false,
    },
    cancelResponseBody,
    readResponseBody,
  }
}

describe('fetchRobotsTxtWithRetry unread bodies', () => {
  it('reads a 200 body without cancelling it', async () => {
    const response = ignoredRobotsResponse(200, 'OK')
    const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>().mockResolvedValue(response)
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeoutSimple)
    readResponseBody.mockResolvedValue(ALLOW_ROBOTS_TXT)

    await expect(fetchRobotsTxtWithRetry('example.com', dependencies)).resolves.toBe(
      ALLOW_ROBOTS_TXT,
    )

    expect(readResponseBody).toHaveBeenCalledWith(
      expect.objectContaining({ response, url: 'https://example.com/robots.txt' }),
    )
    expect(cancelResponseBody).not.toHaveBeenCalled()
  })

  it('cancels a 4xx body instead of reading it', async () => {
    const response = ignoredRobotsResponse(404, 'Not Found')
    const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>().mockResolvedValue(response)
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeoutSimple)

    await expect(fetchRobotsTxtWithRetry('example.com', dependencies)).resolves.toBe(
      ALLOW_ROBOTS_TXT,
    )

    expect(cancelResponseBody).toHaveBeenCalledTimes(1)
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    expect(readResponseBody).not.toHaveBeenCalled()
  })

  it('cancels each 5xx body before the next attempt', async () => {
    vi.useFakeTimers()
    try {
      const responses: Response[] = []
      const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>(async () => {
        const response = ignoredRobotsResponse(503, 'Service Unavailable')
        responses.push(response)
        return response
      })
      const { dependencies, cancelResponseBody, readResponseBody } =
        retryDependencies(fetchWithTimeoutSimple)
      const pending = fetchRobotsTxtWithRetry('example.com', dependencies)
      const settled = pending.then(value => value)
      await vi.runAllTimersAsync()

      await expect(settled).resolves.toBe(ALLOW_ROBOTS_TXT)
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
      expect(cancelResponseBody).toHaveBeenCalledTimes(3)
      for (const response of responses) {
        expect(cancelResponseBody).toHaveBeenCalledWith(response)
      }
      expect(readResponseBody).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels an unread non-retry status before throwing', async () => {
    const response = ignoredRobotsResponse(301, 'Moved Permanently')
    const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>().mockResolvedValue(response)
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeoutSimple)

    await expect(fetchRobotsTxtWithRetry('example.com', dependencies)).rejects.toThrow(
      'Failed to fetch robots.txt for example.com: 301 Moved Permanently',
    )
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    expect(readResponseBody).not.toHaveBeenCalled()
    expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
  })
})
