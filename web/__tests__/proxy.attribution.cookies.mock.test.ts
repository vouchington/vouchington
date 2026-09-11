import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Suppress expected console errors that are tested and handled gracefully
const originalConsoleError = console.error
vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  const message = String(args[0] ?? '')
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

const { mockDecodeSessionJwt } = vi.hoisted(() => ({
  mockDecodeSessionJwt: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@ts-shared/session-jwt'), () => ({
  decodeSessionJwt: mockDecodeSessionJwt,
}))

import proxy from '../proxy'
import { isbot } from 'isbot'

const SESSION_DATA = {
  dt: 'new-dt',
  st: 'new-st',
  uid: 'user-1',
  dte: 2_592_000,
  ste: 172_800,
  secure: false,
}

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

describe('proxy response cookies', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('API_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:2900')
    vi.stubEnv('CF_WORKER_SECRET', 'test-worker-secret')
    fetchMock = vi
      .fn<() => unknown>()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ session: SESSION_DATA }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(isbot).mockReturnValue(false)
    mockNextResponseNext.mockReturnValue({ cookies: { set: mockCookiesSet } })
    mockNextResponseRewrite.mockReturnValue({ cookies: { set: mockCookiesSet } })
    mockAfter.mockImplementation((fn: () => unknown) => fn())
    mockDecodeSessionJwt.mockReturnValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('sets dt and st cookies with correct attributes from backend session response', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'dt',
      'new-dt',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 2_592_000,
      }),
    )
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'st',
      'new-st',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 172_800,
      }),
    )
  })

  it('uses maxAge and secure from session response (backend is source of truth for auth)', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          session: {
            dt: 'new-dt',
            st: 'new-st',
            uid: null,
            dte: 86_400,
            ste: 3600,
            secure: true,
          },
        }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'dt',
      'new-dt',
      expect.objectContaining({ maxAge: 86_400, secure: true }),
    )
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'st',
      'new-st',
      expect.objectContaining({ maxAge: 3600, secure: true }),
    )
  })

  it('does not set cookies when no session', async () => {
    await proxy(makeRequest() as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies for anon session (worker handles Set-Cookie)', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies when session response is missing dte', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ session: { dt: 'new-dt', st: 'new-st', ste: 172_800, secure: false } }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies when session response is missing ste', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ session: { dt: 'new-dt', st: 'new-st', dte: 2_592_000, secure: false } }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies when session response is missing secure', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ session: { dt: 'new-dt', st: 'new-st', dte: 2_592_000, ste: 172_800 } }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })
})
