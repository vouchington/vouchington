import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

// Mirrors the shape backend/rss/posts.mts and backend/rss/news.mts actually emit
// (see backend/rss/posts.test.mts) — keyed requests carry a bearer apikey credential in
// the URL, so the origin sets Referrer-Policy: no-referrer to keep it out of the Referer
// header on outbound link clicks. Anonymous requests get no referrer-policy override.
const originHeaders = (keyed: boolean) => ({
  'content-type': 'application/rss+xml; charset=utf-8',
  'cache-control': keyed ? 'private, max-age=300' : 'public, max-age=300',
  ...(keyed ? { 'referrer-policy': 'no-referrer' } : {}),
})

const ENV: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
}

// The full set of other global security headers addSecurityHeaders always applies —
// asserted unchanged on every RSS variant so this fix cannot regress them.
function expectUnchangedGlobalSecurityHeaders(response: Response) {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  expect(response.headers.get('x-xss-protection')).toBe('0')
  expect(response.headers.get('permissions-policy')).toContain('geolocation=()')
  expect(response.headers.get('origin-agent-cluster')).toBe('?1')
  expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
  expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
}

describe('worker fetch handler — RSS referrer-policy preservation (#8006)', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['posts', 'https://voucha.ai/rss/posts?apikey=fil_test_key'],
    ['news', 'https://voucha.ai/rss/news?apikey=fil_test_key'],
  ])('preserves no-referrer for keyed %s RSS at the edge', async (_name, requestUrl) => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('<rss></rss>', { headers: originHeaders(true) })),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const firstResponse = await worker.fetch(new Request(requestUrl), ENV, createContext(ENV))
    const secondResponse = await worker.fetch(new Request(requestUrl), ENV, createContext(ENV))

    expect(firstResponse.headers.get('referrer-policy')).toBe('no-referrer')
    expect(secondResponse.headers.get('referrer-policy')).toBe('no-referrer')
    // Never shared-cached: the response stays disqualified from shared caching end-to-end.
    expect(firstResponse.headers.get('cache-control')).toContain('private')
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expectUnchangedGlobalSecurityHeaders(firstResponse)
    expectUnchangedGlobalSecurityHeaders(secondResponse)
  })

  it.each([
    ['posts', 'https://voucha.ai/rss/posts'],
    ['news', 'https://voucha.ai/rss/news'],
  ])('keeps the global default referrer-policy for anonymous %s RSS', async (_name, requestUrl) => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('<rss></rss>', { headers: originHeaders(false) })),
    ) as unknown as typeof fetch

    const response = await worker.fetch(new Request(requestUrl), ENV, createContext(ENV))

    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expectUnchangedGlobalSecurityHeaders(response)
  })

  it('does not trust an arbitrary origin referrer-policy value on a keyed RSS request', async () => {
    // Value-restricted gate: even on a keyed RSS route, only the literal "no-referrer" from
    // the origin is ever preserved — never a general passthrough of origin values.
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('<rss></rss>', {
          headers: { 'cache-control': 'private, max-age=300', 'referrer-policy': 'unsafe-url' },
        }),
      ),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/rss/posts?apikey=fil_test_key'),
      ENV,
      createContext(ENV),
    )

    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('keeps the global default referrer-policy on a keyed RSS request when the origin is unreachable', async () => {
    // fetchOriginResponse catches the network failure and returns a 502 Bad Gateway with no
    // referrer-policy header of its own — the value-restricted gate must not invent one.
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.reject(new Error('origin unreachable')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/rss/posts?apikey=fil_test_key'),
      ENV,
      createContext(ENV),
    )

    expect(response.status).toBe(502)
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })
})
