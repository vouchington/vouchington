import {
  cancelResponseBody as cancelResponseBodyFn,
  type fetchWithTimeoutSimple as fetchWithTimeoutSimpleFn,
} from '@modules/utils/http'
import { readResponseBody as readResponseBodyFn } from '@modules/utils/http-body'
import { describe, expect, it, vi } from 'vitest'
import { defaultRobotsDependencies, fetchRobotsTxtWithRetryOutcome } from '../fetch-retry.mts'

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
      retryDelayMs: 0,
    },
    cancelResponseBody,
    readResponseBody,
  }
}

describe('robots fetch unread bodies', () => {
  it('reads a 200 body without cancelling it', async () => {
    const response = ignoredRobotsResponse(200, 'OK')
    const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>().mockResolvedValue(response)
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeoutSimple)
    readResponseBody.mockResolvedValue(ALLOW_ROBOTS_TXT)

    await expect(
      fetchRobotsTxtWithRetryOutcome('example.com', dependencies),
    ).resolves.toMatchObject({
      body: ALLOW_ROBOTS_TXT,
      kind: 'rules',
    })

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

    await expect(
      fetchRobotsTxtWithRetryOutcome('example.com', dependencies),
    ).resolves.toMatchObject({
      body: ALLOW_ROBOTS_TXT,
      kind: 'unavailable',
    })

    expect(cancelResponseBody).toHaveBeenCalledTimes(1)
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    expect(readResponseBody).not.toHaveBeenCalled()
  })

  it('cancels each 5xx body before the next attempt', async () => {
    const responses: Response[] = []
    const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>(async () => {
      const response = ignoredRobotsResponse(503, 'Service Unavailable')
      responses.push(response)
      return response
    })
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeoutSimple)

    await expect(
      fetchRobotsTxtWithRetryOutcome('example.com', dependencies),
    ).resolves.toMatchObject({
      body: 'User-agent: *\nDisallow: /',
      kind: 'unreachable',
    })

    expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
    expect(cancelResponseBody).toHaveBeenCalledTimes(3)
    for (const response of responses) {
      expect(cancelResponseBody).toHaveBeenCalledWith(response)
    }
    expect(readResponseBody).not.toHaveBeenCalled()
  })

  it('cancels an unread non-retry status before throwing', async () => {
    const response = ignoredRobotsResponse(301, 'Moved Permanently')
    const fetchWithTimeoutSimple = vi.fn<FetchWithTimeoutSimpleFn>().mockResolvedValue(response)
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeoutSimple)

    await expect(fetchRobotsTxtWithRetryOutcome('example.com', dependencies)).rejects.toThrow(
      'Failed to fetch robots.txt for example.com: 301 Moved Permanently',
    )
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    expect(readResponseBody).not.toHaveBeenCalled()
    expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
  })
})
