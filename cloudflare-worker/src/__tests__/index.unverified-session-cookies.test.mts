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

// These cover the request-handler.mts hasUnverifiedSessionCookies gate end-to-end (Codex review
// finding on PR #7052): a validly-signed anon `st` (uid: null) is the common state for a
// returning anonymous visitor and must still be cacheable, while an `st` that once claimed a
// real user but now fails edge verification must bypass so web/proxy.ts's cold-refresh-from-`dt`
// path still runs. See auth/jwt.mts's isAuthShapedSessionToken.
describe('worker fetch handler — unverified session cookies gate', () => {
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

  it('caches a web HTML request for a validly-signed anon session (st uid: null)', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response(
          '<!doctype html><script nonce="test-placeholder-nonce-that-is-at-least-32-characters-long"></script>',
          { headers: { 'content-type': 'text/html' } },
        ),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })
    const anonToken = await createSignedSessionJwt({ did, uid: null, sid: mintUUIDv7() })

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { cookie: `dt=${deviceToken}; st=${anonToken}` },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
  })

  it('caches a web HTML request when st is garbage (no auth claim to lose)', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response(
          '<!doctype html><script nonce="test-placeholder-nonce-that-is-at-least-32-characters-long"></script>',
          { headers: { 'content-type': 'text/html' } },
        ),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { cookie: `dt=${deviceToken}; st=not-a-real-token` },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
  })

  it('bypasses cache for a web HTML request when st claims a real user but fails verification', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    // did mismatch: st decodes to a non-null uid (auth-shaped) but fails full edge
    // verification because it doesn't pair with dt — e.g. an expired session the backend
    // can still cold-refresh from dt.
    const deviceToken = await createSignedDeviceJwt({ did: mintUUIDv7() })
    const staleAuthToken = await createSignedSessionJwt({
      did: mintUUIDv7(),
      uid: mintUUIDv7(),
      sid: mintUUIDv7(),
    })

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { cookie: `dt=${deviceToken}; st=${staleAuthToken}` },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
  })
})
