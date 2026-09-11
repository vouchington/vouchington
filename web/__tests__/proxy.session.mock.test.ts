import { afterAll, describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Suppress expected console errors that are tested and handled gracefully
const originalConsoleError = console.error

const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  const message = String(args[0] ?? '')
  // Suppress known expected test errors in this test file
  if (message.includes('Session validation failed')) return
  if (message.includes('Attribution request failed')) return
  originalConsoleError(...args)
})

const { mockNextResponseNext, mockNextResponseRewrite, mockCookiesSet, mockAfter } = vi.hoisted(
  () => {
    const cookiesSet = vi.fn<VitestLooseMock>()
    const nextResponseNext = vi.fn<VitestLooseMock>(() => ({
      cookies: { set: cookiesSet },
    }))
    const nextResponseRewrite = vi.fn<VitestLooseMock>(() => ({
      cookies: { set: cookiesSet },
    }))
    // Execute the callback immediately so attribution fetch runs synchronously in tests
    const after = vi.fn<VitestLooseMock>((fn: () => unknown) => fn())
    return {
      mockNextResponseNext: nextResponseNext,
      mockNextResponseRewrite: nextResponseRewrite,
      mockCookiesSet: cookiesSet,
      mockAfter: after,
    }
  },
)

vi.mock(import('next/server'), () => {
  function NextResponse() {
    const headers = new Headers()
    return { cookies: { set: mockCookiesSet }, headers }
  }
  NextResponse.next = mockNextResponseNext
  NextResponse.rewrite = mockNextResponseRewrite
  return {
    NextResponse,
    after: mockAfter,
  } as unknown as typeof import('next/server')
})

vi.mock(import('isbot'), () => ({
  isbot: vi.fn<VitestLooseMock>(() => false),
}))

// Mock decodeSessionJwt so tests control whether the st is authenticated or anonymous
const { mockDecodeSessionJwt } = vi.hoisted(() => ({
  mockDecodeSessionJwt: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@ts-shared/session-jwt'), () => ({
  decodeSessionJwt: mockDecodeSessionJwt,
}))

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
