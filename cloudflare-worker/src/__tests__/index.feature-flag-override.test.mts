import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

// Covers the request-handler.mts hasFeatureFlagOverrideCookie gate end-to-end (Codex review
// finding on PR #7052): web/proxy.ts forwards the `ff` cookie unconditionally so anonymous
// visitors can override feature flags for QA/experiments, but the anon cache policy strips all
// cookies (stripAllCookies: true) before a cache-populating MISS reaches origin — so an anon
// visitor's own `ff` override would otherwise be silently dropped and they'd receive whatever
// default-variant response another anonymous visitor's request happened to cache. Routing `ff`
// requests to bypass instead preserves proxy.ts's existing per-request forwarding.
describe('worker fetch handler — feature-flag override cookie gate', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  const env: Env = {
    BACKEND_ORIGIN: 'https://backend.example.com',
    WEB_ORIGIN: 'https://web.example.com',
    ANON_CACHE_TTL_SECONDS: '30',
    CACHE_PLACEHOLDER_NONCE: 'test-placeholder-nonce-that-is-at-least-32-characters-long',
  }

  it('bypasses cache for a web HTML request carrying an `ff` feature-flag override cookie', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { cookie: 'ff=some-flag:variant-b' },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
  })

  it('caches a web HTML request with no `ff` cookie', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response(
          '<!doctype html><script nonce="test-placeholder-nonce-that-is-at-least-32-characters-long"></script>',
          { headers: { 'content-type': 'text/html' } },
        ),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))

    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
  })
})
