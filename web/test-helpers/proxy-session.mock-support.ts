import { isbot } from 'isbot'
import { vi } from 'vitest'

const {
  mockAfter,
  mockCookiesSet,
  mockDecodeSessionJwt,
  mockNextResponseNext,
  mockNextResponseRewrite,
} = vi.hoisted(() => {
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
    mockAfter: after,
    mockCookiesSet: cookiesSet,
    mockDecodeSessionJwt: vi.fn<VitestLooseMock>(),
    mockNextResponseNext: nextResponseNext,
    mockNextResponseRewrite: nextResponseRewrite,
  }
})

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

vi.mock(import('@ts-shared/session-jwt'), () => ({
  decodeSessionJwt: mockDecodeSessionJwt,
}))

// Suppress expected console errors that are tested and handled gracefully
const originalConsoleError = console.error

const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  const message =
    args[0] instanceof Error ? args[0].message : typeof args[0] === 'string' ? args[0] : ''
  if (message.includes('Session validation failed')) return
  if (message.includes('Attribution request failed')) return
  originalConsoleError(...args)
})

const proxySessionData = {
  dt: 'new-dt',
  st: 'new-st',
  uid: 'user-1',
  dte: 2_592_000,
  ste: 172_800,
  secure: false,
}

const proxyAuthStPayload = { uid: 'user-1', did: 'did-1', sid: 'sid-1' }

function makeRequest({
  pathname = '/',
  cookies = {} as Record<string, string>,
  headers = {} as Record<string, string>,
  searchParams = {} as Record<string, string>,
  method = 'GET',
  body = '',
} = {}) {
  const url = new URL(`http://localhost${pathname}`)
  for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value)
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

function installProxyTestDoubles() {
  vi.clearAllMocks()
  vi.stubEnv('API_BASE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:2900')
  vi.stubEnv('CF_WORKER_SECRET', 'test-worker-secret')
  const fetchMock = vi.fn<() => unknown>().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ session: proxySessionData }),
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(isbot).mockReturnValue(false)
  mockNextResponseNext.mockReturnValue({ cookies: { set: mockCookiesSet } })
  mockNextResponseRewrite.mockReturnValue({ cookies: { set: mockCookiesSet } })
  mockAfter.mockImplementation((fn: () => unknown) => fn())
  mockDecodeSessionJwt.mockReturnValue(null)
  return fetchMock
}

function resetProxyTestDoubles() {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
}

export {
  consoleSpy,
  installProxyTestDoubles,
  makeRequest,
  mockAfter,
  mockCookiesSet,
  mockDecodeSessionJwt,
  mockNextResponseNext,
  mockNextResponseRewrite,
  proxyAuthStPayload as AUTH_ST_PAYLOAD,
  resetProxyTestDoubles,
}
