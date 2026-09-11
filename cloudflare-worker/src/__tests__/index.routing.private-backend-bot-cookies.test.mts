import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — private backend bot bypass cookies', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('strips bot session cookies before bypassing private backend routes', async () => {
    let capturedRequest: Request | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response(request.headers.get('cookie') ?? 'no-cookie'))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }
    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/feeds/rss_feed_items/follow_rss_feeds', {
        headers: {
          'user-agent': 'ExampleBot/1.0',
          cookie: 'st=user-session; dt=user-device; preference=dark',
        },
      }),
      env,
      context,
    )

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(await response.text()).toBe('preference=dark')
    expect(capturedRequest?.headers.get('cookie')).toBe('preference=dark')
    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
