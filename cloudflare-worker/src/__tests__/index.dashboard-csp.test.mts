import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — dashboard CSP', () => {
  beforeEach(() => setupMemoryCaches())

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('routes the dashboard to backend with its route-scoped CSP', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) =>
      Promise.resolve(new Response(`from:${new URL(request.url).host}`)),
    ) as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/admin/mq-dashboard'),
      env,
      createContext(env),
    )

    expect(await response.text()).toBe('from:backend.example.com')
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
  })

  it('applies the dashboard CSP to nested routes but not other backend routes', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const dashboardResponse = await worker.fetch(
      new Request('https://voucha.ai/admin/mq-dashboard/queues'),
      env,
      createContext(env),
    )
    const apiResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )

    expect(dashboardResponse.headers.get('content-security-policy')).toContain(
      "script-src 'self' 'unsafe-inline'",
    )
    expect(apiResponse.headers.get('content-security-policy')).toBeNull()
  })
})
