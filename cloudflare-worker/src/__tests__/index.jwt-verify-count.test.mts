import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sessionJwt from '@ts-shared/session-jwt'
import { mintUUIDv7 } from '@ts-shared/session-jwt'
import worker from '../index.mts'
import { createSignedDeviceJwt, createSignedSessionJwt } from '../auth/test-jwt-fixtures.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

// Regression guard for the JWT verify-once dedup (see auth/jwt.mts's verifyBackendSessionTokens):
// a returning anonymous visitor (valid backend-signed dt+st, uid: null) must trigger exactly one
// verifyDeviceJwt + one verifySessionJwt call per request, not two of each. Before this dedup,
// verifySessionUidForCache and session-mint.mts's isBackendIssuedAnonSession each independently
// re-verified the same pair, doubling the RSA cost on the hottest cache-classification path.
describe('worker fetch handler — JWT verify-once dedup', () => {
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

  it('verifies a returning anon dt+st pair exactly once each (2 RSA verifications total)', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response(
          '<!doctype html><script nonce="test-placeholder-nonce-that-is-at-least-32-characters-long"></script>',
          { headers: { 'content-type': 'text/html' } },
        ),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const verifyDeviceJwtSpy = vi.spyOn(sessionJwt, 'verifyDeviceJwt')
    const verifySessionJwtSpy = vi.spyOn(sessionJwt, 'verifySessionJwt')

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
    expect(verifyDeviceJwtSpy).toHaveBeenCalledTimes(1)
    expect(verifySessionJwtSpy).toHaveBeenCalledTimes(1)
  })

  // Regression guard: verifyBackendSessionTokens (jwt.mts) only verifies when BOTH dt and st are
  // present, so a lone dt cookie must not trigger an RSA verify before the rate-limit check below
  // in request-handler.mts. Before this fix, verifyBackendSessionTokens verified a lone dt
  // unconditionally, letting a rate-limited (or bot/federation) dt-only request pay for a
  // signature check it never used a decision from.
  it('does not verify a lone dt cookie before a request is rejected by rate limiting', async () => {
    const verifyDeviceJwtSpy = vi.spyOn(sessionJwt, 'verifyDeviceJwt')
    const verifySessionJwtSpy = vi.spyOn(sessionJwt, 'verifySessionJwt')

    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })

    const rateLimitedEnv: Env = {
      ...env,
      RATE_LIMITER_GET_HEAD: { limit: () => ({ success: false }) },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { cookie: `dt=${deviceToken}`, 'cf-connecting-ip': '1.1.1.1' },
      }),
      rateLimitedEnv,
      createContext(rateLimitedEnv),
    )

    expect(response.status).toBe(429)
    expect(verifyDeviceJwtSpy).not.toHaveBeenCalled()
    expect(verifySessionJwtSpy).not.toHaveBeenCalled()
  })
})
