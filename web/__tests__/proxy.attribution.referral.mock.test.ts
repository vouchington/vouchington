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

describe('proxy attribution', () => {
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
