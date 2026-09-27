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

export {
  consoleSpy,
  mockAfter,
  mockCookiesSet,
  mockDecodeSessionJwt,
  mockNextResponseNext,
  mockNextResponseRewrite,
}
