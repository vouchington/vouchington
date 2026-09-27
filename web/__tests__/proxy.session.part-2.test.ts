import {
  consoleSpy,
  mockAfter,
  mockCookiesSet,
  mockDecodeSessionJwt,
  mockNextResponseNext,
  mockNextResponseRewrite,
} from '@/test-helpers/proxy-session.mock-support'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import proxy from '../proxy'

import { isbot } from 'isbot'

describe('proxy.session', () => {
  afterAll(() => {
    consoleSpy.mockRestore()
  })

  const AUTH_SESSION_DATA = {
    dt: 'new-dt',
    st: 'new-st',
    uid: 'user-1',
    dte: 2_592_000,
    ste: 172_800,
    secure: false,
  }

  // Payload returned when st is an authenticated session token
  const AUTH_ST_PAYLOAD = { uid: 'user-1', did: 'did-1', sid: 'sid-1' }

  function makeRequest({
    pathname = '/',
    cookies = {} as Record<string, string>,
    headers = {} as Record<string, string>,
    searchParams = {} as Record<string, string>,
    method = 'GET',
    body = '',
  } = {}) {
    const url = new URL(`http://localhost${pathname}`)
    for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v)
    return {
      method,
      headers: new Headers(headers),
      nextUrl: {
        pathname: url.pathname,
        searchParams: url.searchParams,
        toString: () => url.toString(),
      },
      cookies: {
        get: (name: string) => (cookies[name] !== undefined ? { value: cookies[name] } : undefined),
      },
      text: () => Promise.resolve(body),
    }
  }

  describe('proxy', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      vi.clearAllMocks()
      vi.stubEnv('API_BASE_URL', '')
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:2900')
      vi.stubEnv('CF_WORKER_SECRET', 'test-worker-secret')
      fetchMock = vi.fn<() => unknown>().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ session: AUTH_SESSION_DATA }),
      })
      vi.stubGlobal('fetch', fetchMock)
      vi.mocked(isbot).mockReturnValue(false)
      mockNextResponseNext.mockReturnValue({ cookies: { set: mockCookiesSet } })
      mockNextResponseRewrite.mockReturnValue({ cookies: { set: mockCookiesSet } })
      mockAfter.mockImplementation((fn: () => unknown) => fn())
      // Default: no uid (anonymous session)
      mockDecodeSessionJwt.mockReturnValue(null)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })

    describe('JWT request forwarding', () => {
      it('sets only cookie headers from backend session data', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-session-token')).toBeNull()
        expect(headers.get('x-user-id')).toBeNull()
        expect(headers.get('cookie')).toBe('dt=new-dt; st=new-st')
      })

      it('sets only cookie from inbound cookies for anon', async () => {
        mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-session-token')).toBeNull()
        expect(headers.get('cookie')).toBe('dt=my-dt; st=my-st')
      })

      it('does not set x-user-id when uid is in backend session', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
      })

      it('replaces cookie header with only dt/st, dropping other browser cookies', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(
          makeRequest({
            cookies: { dt: 'my-dt', st: 'my-st', 'other-cookie': 'value', 'feature-flag': 'on' },
          }) as any,
        )
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('cookie')).toBe('dt=new-dt; st=new-st')
      })

      it('omits x-user-id when uid is null from backend session', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              session: {
                dt: 'new-dt',
                st: 'new-st',
                uid: null,
                dte: 2_592_000,
                ste: 172_800,
                secure: false,
              },
            }),
        })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
      })

      it('drops inbound auth cookies and headers when decoded st looks authenticated but backend validation fails', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockResolvedValue({ ok: false })

        await proxy(
          makeRequest({
            cookies: { dt: 'my-dt', st: 'my-st' },
            headers: {
              'x-device-token': 'injected-device',
              'x-session-token': 'injected-session',
              'x-user-id': 'injected-user',
            },
          }) as any,
        )

        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('cookie')).toBeNull()
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-session-token')).toBeNull()
        expect(headers.get('x-user-id')).toBeNull()
      })
    })
  })
})
