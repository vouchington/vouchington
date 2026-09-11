// @vitest-environment node

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerRequest } from './request'

const { mockCookies, mockHeaders, mockFetch } = vi.hoisted(() => ({
  mockCookies: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>(),
  mockFetch: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/headers'), () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}))

vi.stubGlobal('fetch', mockFetch)

describe('request', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  describe('ServerRequest', () => {
    beforeEach(() => {
      mockCookies.mockReset()
      mockHeaders.mockReset()
      mockFetch.mockReset()
      mockHeaders.mockResolvedValue(new Headers())
      mockCookies.mockResolvedValue({
        get: (name: string) => {
          if (name === 'dt') return { value: 'device-token' }
          if (name === 'st') return { value: 'session-token' }
          return undefined
        },
      })
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubEnv('CF_WORKER_SECRET', 'test-worker-secret')
      vi.stubEnv('API_BASE_URL', 'http://localhost:2900')
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:2900')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('forwards CF_WORKER_SECRET and auth cookies to backend-origin requests', async () => {
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-cf-worker-secret': 'test-worker-secret',
        'x-voucha-app-version': 'development',
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
        Cookie: 'dt=device-token; st=session-token',
      })
      expect((init.headers as Record<string, string>)['x-request-id']).toBeUndefined()
    })

    it('disables fetch caching when auth cookies are forwarded', async () => {
      const request = new ServerRequest()

      await request.request('/api/v1/posts/post-1')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.cache).toBe('no-store')
    })

    it('disables fetch caching for unauthenticated server API requests', async () => {
      mockCookies.mockResolvedValue({
        get: () => undefined,
      })
      const request = new ServerRequest()

      await request.request('/api/v1/posts/post-1')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.cache).toBe('no-store')
    })

    it('adds an origin header to cookie-authenticated server mutations', async () => {
      const request = new ServerRequest()

      await request.post('/api/v1/posts', { title: 'Test' })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        Cookie: 'dt=device-token; st=session-token',
        Origin: 'http://localhost:2900',
      })
    })

    it('adds an origin header to caller-supplied cookie mutations', async () => {
      const request = new ServerRequest()

      await request.post(
        '/api/v1/posts',
        { title: 'Test' },
        { headers: { Cookie: 'dt=caller-device' } },
      )

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        Cookie: 'dt=caller-device',
        Origin: 'http://localhost:2900',
      })
    })

    it('forwards safe feature flag cookies', async () => {
      mockCookies.mockResolvedValue({
        get: (name: string) => {
          if (name === 'dt') return { value: 'device-token' }
          if (name === 'st') return { value: 'session-token' }
          if (name === 'ff') return { value: 'eyJtZW1iZXJzaGlwcyI6dHJ1ZX0=' }
          return undefined
        },
      })
      const request = new ServerRequest()

      await request.request('/api/v1/feature-flags')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        Cookie: 'dt=device-token; st=session-token; ff=eyJtZW1iZXJzaGlwcyI6dHJ1ZX0=',
      })
    })

    it('drops unsafe feature flag cookies', async () => {
      mockCookies.mockResolvedValue({
        get: (name: string) => {
          if (name === 'dt') return { value: 'device-token' }
          if (name === 'st') return { value: 'session-token' }
          if (name === 'ff') return { value: 'not-valid-base64!!!' }
          return undefined
        },
      })
      const request = new ServerRequest()

      await request.request('/api/v1/feature-flags')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        Cookie: 'dt=device-token; st=session-token',
      })
    })

    it('forwards inbound x-request-id from Next.js headers to backend fetch', async () => {
      mockHeaders.mockResolvedValue(new Headers({ 'x-request-id': 'test-request-id-123' }))
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect((init.headers as Record<string, string>)['x-request-id']).toBe('test-request-id-123')
    })

    it('forwards only trusted inbound client IP headers to backend fetches', async () => {
      mockHeaders.mockResolvedValue(
        new Headers({ 'cf-connecting-ip': '203.0.113.4', 'x-forwarded-for': '203.0.113.4' }),
      )
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me', {
        headers: { 'x-forwarded-for': 'attacker-supplied' },
      })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        'cf-connecting-ip': '203.0.113.4',
        'x-forwarded-for': '203.0.113.4',
      })
    })

    it('uses the deployed git commit as the web app version', async () => {
      vi.stubEnv('NEXT_PUBLIC_GIT_COMMIT', 'web-release')
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({ 'x-voucha-app-version': 'web-release' })
    })

    it('does not allow per-call headers to override web client identity', async () => {
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me', {
        headers: {
          'x-voucha-app-version': 'spoofed',
          'x-voucha-client': 'swift',
          'x-voucha-platform': 'ios',
        },
      })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.headers).toMatchObject({
        'x-voucha-app-version': 'development',
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
      })
    })

    it('per-call x-request-id header override wins over inbound request id', async () => {
      mockHeaders.mockResolvedValue(new Headers({ 'x-request-id': 'inbound-id' }))
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me', {
        headers: { 'x-request-id': 'override-id' },
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect((init.headers as Record<string, string>)['x-request-id']).toBe('override-id')
    })

    it('missing request scope (headers() throws) does not throw and omits x-request-id', async () => {
      mockHeaders.mockRejectedValue(new Error('headers() called outside request scope'))
      const request = new ServerRequest()

      await request.request('/api/v1/auth/me')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect((init.headers as Record<string, string>)['x-request-id']).toBeUndefined()
    })

    it('keeps caller GET headers scoped across concurrent requests', async () => {
      mockCookies.mockResolvedValue({
        get: () => undefined,
      })
      mockFetch
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      const request = new ServerRequest()

      await Promise.all([
        request.get('/api/v1/posts', { headers: { 'x-request-id': 'request-a' } }),
        request.get('/api/v1/posts', { headers: { 'x-request-id': 'request-b' } }),
      ])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const requestIds = mockFetch.mock.calls.map(([, init]) => {
        const { headers } = init as RequestInit
        return (headers as Record<string, string>)['x-request-id']
      })
      expect(requestIds.toSorted()).toEqual(['request-a', 'request-b'])
    })
  })
})
