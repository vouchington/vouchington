import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — login cache bypass', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('bypasses cache for /login even for bot requests', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      const url = new URL(request.url)
      return Promise.resolve(new Response(`from:${url.host}`))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    const request = new Request('https://voucha.ai/login', {
      headers: {
        'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      },
    })

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(await firstResponse.text()).toBe('from:web.example.com')
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(firstResponse.headers.get('cache-control')).toBeNull()
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
