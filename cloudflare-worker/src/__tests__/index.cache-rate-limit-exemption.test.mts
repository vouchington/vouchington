import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const PLACEHOLDER_NONCE = 'test-placeholder-nonce-that-is-at-least-32-characters-long'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    BACKEND_ORIGIN: 'https://backend.example.com',
    SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
    WEB_ORIGIN: 'https://web.example.com',
    CACHE_PLACEHOLDER_NONCE: PLACEHOLDER_NONCE,
    ...overrides,
  }
}

describe('worker cache-aware rate-limit exemption', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('<html></html>', {
          headers: { 'content-type': 'text/html', 'cache-control': 'public' },
        }),
      ),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['sitemap', '/sitemap.xml'],
    ['RSS', '/rss/posts'],
    ['static web asset', '/favicon.ico'],
  ])('rate-limits a HEAD %s request because HEAD cannot dispatch to cache', async (_name, path) => {
    const env = makeEnv({
      RATE_LIMITER_GET_HEAD: { limit: () => ({ success: false }) },
    })

    const response = await worker.fetch(
      new Request(`https://voucha.ai${path}`, {
        method: 'HEAD',
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['Bearer authorization', { authorization: 'Bearer token' }],
    ['an RSC request', { rsc: '1' }],
  ])('rate-limits a fully cached GET bypassed by %s', async (_name, headers) => {
    const env = makeEnv({
      RATE_LIMITER_GET_HEAD: { limit: () => ({ success: false }) },
    })

    const response = await worker.fetch(
      new Request('https://voucha.ai/rss/posts', {
        headers: { 'cf-connecting-ip': '1.1.1.1', ...headers },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['HEAD', { method: 'HEAD', headers: {} }],
    ['Bearer authorization', { method: 'GET', headers: { authorization: 'Bearer token' } }],
    ['an RSC request', { method: 'GET', headers: { rsc: '1' } }],
  ])(
    'consumes the successful limiter and reaches origin for a %s cache bypass',
    async (_name, requestInit) => {
      const limiter = vi.fn<VitestLooseMock>(() => ({ success: true }))
      const env = makeEnv({ RATE_LIMITER_GET_HEAD: { limit: limiter } })

      const response = await worker.fetch(
        new Request('https://voucha.ai/rss/posts', {
          ...requestInit,
          headers: { 'cf-connecting-ip': '1.1.1.1', ...requestInit.headers },
        }),
        env,
        createContext(env),
      )

      expect(response.status).toBe(200)
      expect(limiter).toHaveBeenCalledOnce()
      expect(globalThis.fetch).toHaveBeenCalledOnce()
    },
  )

  it('rate-limits a static web GET when a missing placeholder nonce prevents dispatch', async () => {
    const env = makeEnv({
      CACHE_PLACEHOLDER_NONCE: undefined,
      RATE_LIMITER_GET_HEAD: { limit: () => ({ success: false }) },
    })

    const response = await worker.fetch(
      new Request('https://voucha.ai/favicon.ico', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('exempts a fully cached GET that dispatches to CachedOrigin', async () => {
    const limiter = vi.fn<VitestLooseMock>(() => ({ success: false }))
    const env = makeEnv({ RATE_LIMITER_GET_HEAD: { limit: limiter } })

    const response = await worker.fetch(
      new Request('https://voucha.ai/rss/posts', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(limiter).not.toHaveBeenCalled()
  })

  it('does not classify an API next-action header as a Server Action', async () => {
    const keys: string[] = []
    const env = makeEnv({
      RATE_LIMITER_MUTATING: {
        limit: ({ key }) => {
          keys.push(key)
          return { success: true }
        },
      },
      RATE_LIMITER_SERVER_ACTION: {
        limit: ({ key }) => {
          keys.push(key)
          return { success: false }
        },
      },
    })

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '1.1.1.1', 'next-action': 'spoofed' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(keys).toEqual(['anon:api:MUTATING:1.1.1.1'])
  })
})
