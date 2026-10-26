import {
  AUTH_ST_PAYLOAD,
  consoleSpy,
  installProxyTestDoubles,
  makeRequest,
  mockCookiesSet,
  mockDecodeSessionJwt,
  mockDecodeDeviceJwt,
  mockNextResponseRedirect,
  mockNextResponseNext,
  mockNextResponseRewrite,
  resetProxyTestDoubles,
} from '@/test-helpers/proxy-session.mock-support'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import proxy from '../proxy'

import { isbot } from 'isbot'

describe('proxy.session', () => {
  afterAll(() => {
    consoleSpy.mockRestore()
  })

  describe('proxy', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = installProxyTestDoubles()
    })

    afterEach(() => {
      resetProxyTestDoubles()
    })

    describe('bot detection', () => {
      it('skips session fetch for bots on normal routes', async () => {
        vi.mocked(isbot).mockReturnValue(true)
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockNextResponseNext).toHaveBeenCalled()
      })

      it('still rewrites landing page routes for bots', async () => {
        vi.mocked(isbot).mockReturnValue(true)
        await proxy(makeRequest({ pathname: '/@tests/bonus' }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockNextResponseRewrite).toHaveBeenCalled()
      })

      it('does not rewrite invalid @-prefixed usernames', async () => {
        await proxy(makeRequest({ pathname: '/@1bad/bonus' }) as any)
        expect(mockNextResponseRewrite).not.toHaveBeenCalled()
        expect(mockNextResponseNext).toHaveBeenCalled()
      })
    })

    describe('proxy bypass paths', () => {
      it('returns early for Next.js internals without calling /api/v1/session', async () => {
        await proxy(makeRequest({ pathname: '/_next/static/chunks/app.js' }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockNextResponseNext).toHaveBeenCalledWith()
      })

      it('returns early for static assets without calling /api/v1/session', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ pathname: '/images/logo.png', cookies: { dt: 'my-dt' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockNextResponseNext).toHaveBeenCalledWith()
      })
    })

    describe('session fetching', () => {
      it('never renews authenticated credentials during SSR even with a configured backend', async () => {
        vi.stubEnv('API_BASE_URL', 'http://localhost:3101')
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockCookiesSet).not.toHaveBeenCalled()
      })

      it('skips /api/v1/session when no cookies and no referrer', async () => {
        await proxy(makeRequest() as any)
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('skips /api/v1/session on backend paths even with referrer', async () => {
        await proxy(
          makeRequest({ pathname: '/api/v1/data', searchParams: { referrer: 'src123' } }) as any,
        )
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('forwards authenticated access cookies without rotating them', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        const headers = mockNextResponseNext.mock.calls[0]![0].request.headers as Headers
        expect(headers.get('cookie')).toBe('dt=my-dt; st=my-st')
      })

      it('forwards a hot authenticated cookie without renewing it', async () => {
        const now = Math.floor(Date.now() / 1000)
        mockDecodeSessionJwt.mockReturnValue({ ...AUTH_ST_PAYLOAD, sca: now + 300, exp: now + 600 })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)

        expect(fetchMock).not.toHaveBeenCalled()
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('cookie')).toBe('dt=my-dt; st=my-st')
        expect(mockCookiesSet).not.toHaveBeenCalled()
      })

      it('forwards an access cookie with a due recheck without rotating during SSR', async () => {
        mockDecodeSessionJwt.mockReturnValue({
          ...AUTH_ST_PAYLOAD,
          sca: 0,
          exp: Math.floor(Date.now() / 1000) + 600,
        })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockCookiesSet).not.toHaveBeenCalled()
        const headers = mockNextResponseNext.mock.calls[0]![0].request.headers as Headers
        expect(headers.get('cookie')).toBe('dt=my-dt; st=my-st')
      })

      it('hands expired access to browser renewal without rotating during SSR', async () => {
        mockDecodeSessionJwt.mockReturnValue({ ...AUTH_ST_PAYLOAD, exp: 0 })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockCookiesSet).not.toHaveBeenCalled()
        expect(mockNextResponseRedirect).toHaveBeenCalledWith(
          new URL('http://localhost/session-renewal?next=%2F'),
        )
      })

      it('leaves expired authenticated prefetch without a cached renewal redirect', async () => {
        mockDecodeSessionJwt.mockReturnValue({ ...AUTH_ST_PAYLOAD, exp: 0 })
        const response = await proxy(
          makeRequest({
            pathname: '/news',
            cookies: { dt: 'my-dt', st: 'my-st' },
            headers: { 'next-router-prefetch': '1' },
          }) as any,
        )

        expect(response.status).toBe(204)
        expect(mockNextResponseRedirect).not.toHaveBeenCalled()
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('skips /api/v1/session when st is anonymous (uid null)', async () => {
        mockDecodeSessionJwt.mockReturnValue({
          uid: null,
          did: 'did-1',
          sid: 'sid-1',
          exp: Math.floor(Date.now() / 1000) + 600,
        })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('drops invalid decoded session cookies instead of forwarding them as anonymous', async () => {
        mockDecodeSessionJwt.mockReturnValue(null)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'bad-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(fetchMock).not.toHaveBeenCalled()
        expect(headers.get('cookie')).toBeNull()
      })

      it('hands off expired navigation using authenticated device identity when access is absent', async () => {
        mockDecodeDeviceJwt.mockReturnValue({ client: 'web', refresh_uid: 'owned-user' })
        await proxy(
          makeRequest({
            pathname: '/news',
            cookies: { dt: 'my-dt' },
            searchParams: { topic: 'owned' },
          }) as any,
        )
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockNextResponseRedirect).toHaveBeenCalledWith(
          new URL('http://localhost/session-renewal?next=%2Fnews%3Ftopic%3Downed'),
        )
      })

      it('skips /api/v1/session when st is absent', async () => {
        await proxy(makeRequest({ cookies: { dt: 'my-dt' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('renders the renewal page without a redirect loop', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        mockDecodeSessionJwt.mockReturnValue({ ...AUTH_ST_PAYLOAD, exp: 0 })
        await proxy(
          makeRequest({
            pathname: '/session-renewal',
            cookies: { dt: 'my-dt', st: 'my-st' },
          }) as any,
        )
        expect(mockNextResponseNext).toHaveBeenCalled()
        expect(mockCookiesSet).not.toHaveBeenCalled()
      })

      it('renders login without a renewal redirect', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        mockDecodeSessionJwt.mockReturnValue({ ...AUTH_ST_PAYLOAD, exp: 0 })
        await proxy(
          makeRequest({ pathname: '/login', cookies: { dt: 'my-dt', st: 'my-st' } }) as any,
        )
        expect(mockCookiesSet).not.toHaveBeenCalled()
      })
    })

    describe('header injection prevention', () => {
      it('forwards sanitized pathname and search headers', async () => {
        await proxy(
          makeRequest({
            pathname: '/topic/source-topic/posts',
            searchParams: { after: 'cursor-1' },
          }) as any,
        )
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-pathname')).toBe('/topic/source-topic/posts')
        expect(headers.get('x-search')).toBe('after=cursor-1')
      })

      it('strips injected x-user-id when there is no valid session', async () => {
        await proxy(makeRequest({ headers: { 'x-user-id': 'injected-id' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
      })

      it('strips injected x-device-token when there is no valid session', async () => {
        await proxy(makeRequest({ headers: { 'x-device-token': 'injected' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-device-token')).toBeNull()
      })

      it('strips injected x-session-token when there is no valid session', async () => {
        await proxy(makeRequest({ headers: { 'x-session-token': 'injected' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-session-token')).toBeNull()
      })

      it('strips private Worker bot metadata before Next request handling', async () => {
        await proxy(makeRequest({ headers: { 'x-voucha-bot-score': '7' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-voucha-bot-score')).toBeNull()
      })

      it('strips injected auth and JA4 headers even when session fetch fails', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockRejectedValue(new Error('Network error'))
        await proxy(
          makeRequest({
            cookies: { dt: 'my-dt', st: 'my-st' },
            headers: {
              'x-user-id': 'injected-id',
              'x-device-token': 'injected',
              'x-voucha-client-ja4': 'forged',
            },
          }) as any,
        )
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-voucha-client-ja4')).toBeNull()
      })
    })
  })
})
