import {
  installProxyTestDoubles,
  makeRequest,
  mockDecodeSessionJwt,
  resetProxyTestDoubles,
} from '@/test-helpers/proxy-session.mock-support'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import proxy from '../proxy'

describe('proxy attribution', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = installProxyTestDoubles()
  })

  afterEach(() => {
    resetProxyTestDoubles()
  })

  it('omits utm from attribution body when no utm params present', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'src123' },
      }) as any,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2900/api/v1/attribution/referrer',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-cf-worker-secret': 'test-worker-secret',
        }),
        body: JSON.stringify({
          referrer: 'src123',
          landing_url: 'http://localhost/?referrer=src123',
        }),
      }),
    )
  })
})
