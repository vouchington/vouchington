import {
  AUTH_ST_PAYLOAD,
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

  it('fires attribution for page request with referrer using inbound cookies (anon)', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'src123' },
      }) as any,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2900/api/v1/attribution/referrer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Origin: 'http://localhost:2900',
          'x-cf-worker-secret': 'test-worker-secret',
        }),
        body: JSON.stringify({
          referrer: 'src123',
          landing_url: 'http://localhost/?referrer=src123',
        }),
      }),
    )
  })

  it('fires attribution for authenticated session using backend-refreshed cookies', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'src123' },
      }) as any,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2900/api/v1/attribution/referrer',
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: 'http://localhost:2900',
          cookie: 'dt=new-dt; st=new-st',
        }),
      }),
    )
  })

  it('does not fire attribution for backend paths', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    await proxy(
      makeRequest({
        pathname: '/api/v1/data',
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'src123' },
      }) as any,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1) // session only
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('attribution'),
      expect.any(Object),
    )
  })

  it('does not fire attribution without referrer', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(fetchMock).toHaveBeenCalledTimes(1) // session only
  })

  it('fires attribution for landing page visits without explicit referrer query', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        pathname: '/@tests/bonus',
        cookies: { dt: 'my-dt', st: 'my-st' },
      }) as any,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2900/api/v1/attribution/referrer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-cf-worker-secret': 'test-worker-secret',
        }),
        body: JSON.stringify({
          referrer: 'tests',
          landing_url: 'http://localhost/@tests/bonus',
        }),
      }),
    )
  })

  it('ignores referrer query overrides on landing page routes', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        pathname: '/@tests/bonus',
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'spoofed' },
      }) as any,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2900/api/v1/attribution/referrer',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-cf-worker-secret': 'test-worker-secret',
        }),
        body: JSON.stringify({
          referrer: 'tests',
          landing_url: 'http://localhost/@tests/bonus?referrer=spoofed',
        }),
      }),
    )
  })
})
