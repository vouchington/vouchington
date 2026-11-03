import {
  cancelResponseBody as cancelResponseBodyFn,
  type fetchWithTimeout as fetchWithTimeoutFn,
} from '@modules/utils/http'
import { readResponseBody as readResponseBodyFn } from '@modules/utils/http-body'
import { describe, expect, it, vi } from 'vitest'
import {
  pinnedRobotsFetchResult,
  resolvePublicRobotsAddresses,
} from '../../../test-helpers/robots-pinned-fetch.mts'
import { fetchRobotsTxtOutcome } from '../fetch-retry.mts'

type CancelResponseBodyFn = typeof cancelResponseBodyFn
type ReadResponseBodyFn = typeof readResponseBodyFn
type FetchWithTimeoutFn = typeof fetchWithTimeoutFn

const ALLOW_ROBOTS_TXT = 'User-agent: *\nAllow: /'

function ignoredRobotsResponse(status: number, statusText: string): Response {
  return {
    status,
    statusText,
    headers: new Headers(),
    body: { cancel: async () => undefined },
  } as Response
}

function retryDependencies(fetchWithTimeout: ReturnType<typeof vi.fn<FetchWithTimeoutFn>>) {
  const cancelResponseBody = vi.fn<CancelResponseBodyFn>()
  const readResponseBody = vi.fn<ReadResponseBodyFn>()
  return {
    dependencies: {
      validateUrl: resolvePublicRobotsAddresses,
      fetchWithTimeout,
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
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValue(pinnedRobotsFetchResult(response))
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeout)
    readResponseBody.mockResolvedValue(ALLOW_ROBOTS_TXT)

    await expect(fetchRobotsTxtOutcome('example.com', dependencies)).resolves.toMatchObject({
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
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValue(pinnedRobotsFetchResult(response))
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeout)

    await expect(fetchRobotsTxtOutcome('example.com', dependencies)).resolves.toMatchObject({
      body: ALLOW_ROBOTS_TXT,
      kind: 'unavailable',
    })

    expect(cancelResponseBody).toHaveBeenCalledTimes(1)
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    expect(readResponseBody).not.toHaveBeenCalled()
  })

  it('cancels each 5xx body before the next attempt', async () => {
    const responses: Response[] = []
    const fetchWithTimeout = vi.fn<FetchWithTimeoutFn>(async () => {
      const response = ignoredRobotsResponse(503, 'Service Unavailable')
      responses.push(response)
      return pinnedRobotsFetchResult(response)
    })
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeout)

    await expect(fetchRobotsTxtOutcome('example.com', dependencies)).resolves.toMatchObject({
      body: 'User-agent: *\nDisallow: /',
      kind: 'unreachable',
    })

    expect(fetchWithTimeout).toHaveBeenCalledTimes(3)
    expect(cancelResponseBody).toHaveBeenCalledTimes(3)
    for (const response of responses) {
      expect(cancelResponseBody).toHaveBeenCalledWith(response)
    }
    expect(readResponseBody).not.toHaveBeenCalled()
  })

  it('cancels an unread non-retry status before throwing', async () => {
    const response = ignoredRobotsResponse(304, 'Not Modified')
    const fetchWithTimeout = vi
      .fn<FetchWithTimeoutFn>()
      .mockResolvedValue(pinnedRobotsFetchResult(response))
    const { dependencies, cancelResponseBody, readResponseBody } =
      retryDependencies(fetchWithTimeout)

    await expect(fetchRobotsTxtOutcome('example.com', dependencies)).rejects.toThrow(
      'Failed to fetch robots.txt for example.com: 304 Not Modified',
    )
    expect(cancelResponseBody).toHaveBeenCalledWith(response)
    expect(readResponseBody).not.toHaveBeenCalled()
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
  })
})
