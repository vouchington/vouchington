import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
}

const CREDS = 'alice:hunter2,bob:s3cr3t'

// Split out of index.basic-auth.test.mts (which hit the 300-line file cap) — covers the
// same exemption-allowlist scenario for /infra/cache-purge specifically.
describe('staging basic auth — /infra/cache-purge exemption', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('bypasses Basic Auth (own secret header gates it instead)', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/infra/cache-purge', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '1.1.1.1', 'content-type': 'application/json' },
        body: '{}',
      }),
      env,
      createContext(env),
    )

    // Reaches handleCachePurgeRequest (503: CF_WORKER_SECRET is unset in baseEnv) rather
    // than the Basic Auth gate's 401 challenge — proven by the absent WWW-Authenticate
    // header, since a Basic-Auth-gated 401 always sets one.
    expect(response.status).toBe(503)
    expect(response.headers.get('www-authenticate')).toBeNull()
  })
})
