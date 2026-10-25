import type { fetchWithTimeout as fetchWithTimeoutFn } from '@modules/utils/http'
import { readResponseBody as readResponseBodyFn } from '@modules/utils/http-body'
import type { validateUrl as validateUrlFn } from 'ssrf-guard/node'
import { describe, expect, it, vi } from 'vitest'
import { defaultRobotsDependencies, fetchRobotsTxtWithRetryOutcome } from '../fetch-retry.mts'

type ReadResponseBodyFn = typeof readResponseBodyFn
type FetchWithTimeoutFn = typeof fetchWithTimeoutFn
type ValidateUrlFn = typeof validateUrlFn

const PUBLIC_ADDRESSES = [{ address: '93.184.216.34', family: 4 as const }]

function robotsHttpResponse(status: number): Response {
  return {
    status,
    statusText: 'OK',
    headers: new Headers(),
    body: {} as Response['body'],
  } as Response
}

describe('robots fetch body deadline', () => {
  it('passes the chain deadline signal into the body read', async () => {
    const response = robotsHttpResponse(200)
    const readResponseBody = vi
      .fn<ReadResponseBodyFn>()
      .mockResolvedValue('User-agent: *\nAllow: /\n')

    await expect(
      fetchRobotsTxtWithRetryOutcome('example.com', {
        ...defaultRobotsDependencies,
        validateUrl: vi.fn<ValidateUrlFn>().mockResolvedValue(PUBLIC_ADDRESSES),
        fetchWithTimeout: vi.fn<FetchWithTimeoutFn>().mockResolvedValue({
          response,
          responseSignal: AbortSignal.timeout(10_000),
        }),
        readResponseBody,
        checkDomainBlacklisted: async () => false,
      }),
    ).resolves.toMatchObject({ body: 'User-agent: *\nAllow: /\n', kind: 'rules' })

    expect(readResponseBody).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/robots.txt',
        response,
        signal: expect.any(AbortSignal),
      }),
    )
    expect(readResponseBody.mock.calls[0]?.[0].signal?.aborted).toBe(false)
  })
})
