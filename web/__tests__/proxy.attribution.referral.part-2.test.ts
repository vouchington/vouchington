import {
  installProxyTestDoubles,
  makeRequest,
  mockAfter,
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

  it('schedules attribution via after() to extend edge runtime lifetime', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'src123' },
      }) as any,
    )
    expect(mockAfter).toHaveBeenCalled()
  })

  it('does not fire attribution when st cookie is absent', async () => {
    await proxy(
      makeRequest({ cookies: { dt: 'my-dt' }, searchParams: { referrer: 'src123' } }) as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not schedule attribution when Global Privacy Control is active', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })

    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        headers: { 'sec-gpc': '1' },
        searchParams: { referrer: 'src123' },
      }) as any,
    )

    expect(mockAfter).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/attribution/referrer'),
      expect.any(Object),
    )
  })

  it('forwards utm params in attribution request body', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: {
          referrer: 'src123',
          utm_source: 'twitter',
          utm_medium: 'social',
          utm_campaign: 'launch',
          utm_content: 'bio',
        },
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
          landing_url:
            'http://localhost/?referrer=src123&utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_content=bio',
          utm: {
            utm_source: 'twitter',
            utm_medium: 'social',
            utm_campaign: 'launch',
            utm_content: 'bio',
          },
        }),
      }),
    )
  })

  it('forwards ref param as utm_source when utm_source is absent', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(
      makeRequest({
        cookies: { dt: 'my-dt', st: 'my-st' },
        searchParams: { referrer: 'src123', ref: 'ig' },
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
          landing_url: 'http://localhost/?referrer=src123&ref=ig',
          utm: {
            utm_source: 'ig',
            utm_medium: null,
            utm_campaign: null,
            utm_content: null,
          },
        }),
      }),
    )
  })
})
