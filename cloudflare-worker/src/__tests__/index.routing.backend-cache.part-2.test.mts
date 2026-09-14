import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintUUIDv7 } from '@ts-shared/session-jwt'

import worker from '../index.mts'

import { createSignedDeviceJwt, createSignedSessionJwt } from '../auth/test-jwt-fixtures.mts'

import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'

import type { Env } from '../types.mts'

describe('worker fetch handler — routing and caching', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('bypasses cache when st payload includes uid', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })
    const token = await createSignedSessionJwt({
      did,
      uid: mintUUIDv7(),
      sid: mintUUIDv7(),
    })

    const request = new Request('https://voucha.ai/', {
      headers: {
        cookie: `st=${token}; dt=${deviceToken}`,
      },
    })

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('bypasses cache for web routes when uid-bearing st is sent without dt', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const token = await createSignedSessionJwt({
      did: mintUUIDv7(),
      uid: mintUUIDv7(),
      sid: mintUUIDv7(),
    })

    const request = new Request('https://voucha.ai/', {
      headers: {
        cookie: `st=${token}`,
      },
    })

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('bypasses cache for web routes so nonce-bearing HTML is not reused', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const request = new Request('https://voucha.ai/about')

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('caches configured static web assets without reusing HTML page responses', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('icon')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CACHED_STATIC_PATHS: '/favicon.ico',
      CACHE_PLACEHOLDER_NONCE: 'test-placeholder-nonce-that-is-at-least-32-characters-long',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/favicon.ico'),
      env,
      context,
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/favicon.ico'),
      env,
      context,
    )

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    // Static assets dispatch under the 'static' audience partition — distinct
    // from the 'anon'/'bot' partitions HTML page dispatch uses — so a favicon
    // fetch can never collide with an HTML page's cache entry.
    const [, firstInit] = dispatchSpy.mock.calls[0]
    expect(firstInit.props.audience).toBe('static')
  })

  it('bypasses cache for web routes when uid-bearing st is sent with mismatched dt', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const deviceToken = await createSignedDeviceJwt({ did: mintUUIDv7() })
    const token = await createSignedSessionJwt({
      did: mintUUIDv7(),
      uid: mintUUIDv7(),
      sid: mintUUIDv7(),
    })

    const request = new Request('https://voucha.ai/', {
      headers: {
        cookie: `st=${token}; dt=${deviceToken}`,
      },
    })

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it.each([
    [401, 'https://voucha.ai/api/v1/posts', 'unauthorized'],
    [403, 'https://voucha.ai/api/v1/topics/private-topic', 'forbidden'],
    [500, 'https://voucha.ai/api/v1/posts', 'server error'],
  ] as const)(
    'does not cache backend %i responses and marks them no-store',
    async (status, url, body) => {
      const fetchSpy = vi.fn<VitestLooseMock>(() =>
        Promise.resolve(
          new Response(body, {
            status,
            headers: { 'cache-control': 'public, max-age=300' },
          }),
        ),
      )
      globalThis.fetch = fetchSpy as unknown as typeof fetch

      const env: Env = {
        BACKEND_ORIGIN: 'https://backend.example.com',
        WEB_ORIGIN: 'https://web.example.com',
        ANON_CACHE_TTL_SECONDS: '30',
        BOT_CACHE_TTL_SECONDS: '86400',
        SITEMAP_CACHE_TTL_SECONDS: '86400',
      }

      const request = new Request(url)

      const firstResponse = await worker.fetch(request, env, createContext(env))
      const secondResponse = await worker.fetch(request, env, createContext(env))

      expect(firstResponse.status).toBe(status)
      expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
      expect(firstResponse.headers.get('cache-control')).toBe(
        'no-store, max-age=0, must-revalidate',
      )
      expect(firstResponse.headers.get('cdn-cache-control')).toBe('no-store')
      expect(firstResponse.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
      expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    },
  )
})
