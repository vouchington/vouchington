import {
  AUTH_ST_PAYLOAD,
  consoleSpy,
  installProxyTestDoubles,
  makeRequest,
  mockCookiesSet,
  mockDecodeSessionJwt,
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
      it('prefers API_BASE_URL over NEXT_PUBLIC_API_BASE_URL', async () => {
        vi.stubEnv('API_BASE_URL', 'http://localhost:3101')
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3101/api/v1/session',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ dt: 'my-dt', st: 'my-st' }),
          }),
        )
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

      it('calls /api/v1/session when st has uid (authenticated)', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:2900/api/v1/session',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ dt: 'my-dt', st: 'my-st' }),
            headers: expect.objectContaining({
              'x-cf-worker-secret': 'test-worker-secret',
            }),
          }),
        )
      })

      it('skips /api/v1/session when st is anonymous (uid null)', async () => {
        mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
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

      it('skips /api/v1/session when st is absent', async () => {
        await proxy(makeRequest({ cookies: { dt: 'my-dt' } }) as any)
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('continues without session when /api/v1/session throws', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockRejectedValue(new Error('Network error'))
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        expect(mockNextResponseNext).toHaveBeenCalled()
        expect(mockCookiesSet).not.toHaveBeenCalled()
      })

      it('continues without session when /api/v1/session returns non-ok', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockResolvedValue({ ok: false })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
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

      it('strips injected auth headers even when session fetch fails', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockRejectedValue(new Error('Network error'))
        await proxy(
          makeRequest({
            cookies: { dt: 'my-dt', st: 'my-st' },
            headers: { 'x-user-id': 'injected-id', 'x-device-token': 'injected' },
          }) as any,
        )
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
        expect(headers.get('x-device-token')).toBeNull()
      })
    })
  })
})
