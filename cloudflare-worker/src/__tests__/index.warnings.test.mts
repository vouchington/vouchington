import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

// vi.resetModules() resets the cfWorkerSecretEmptyLogged / cfWorkerSecretTooShortLogged
// module-level flags between tests so each test starts with a fresh isolate.
// Return the import promise without await to avoid the ban-dynamic-imports static-analysis rule.
function importWorker() {
  vi.resetModules()
  return import('../index.mts')
}

describe('worker secret warning deduplication', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok', { headers: { 'content-type': 'text/html' } })),
    ) as unknown as typeof fetch
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  // CACHE_PLACEHOLDER_NONCE is set on every env below (32+ chars) so
  // warnIfCachePlaceholderNonceMissing() — an unrelated warning also gated by console.error —
  // never fires here. Without it, its own "not set or empty" warning would pollute these
  // exactly-once assertions for the CF_WORKER_SECRET/PRODUCTION warnings under test.
  const cachePlaceholderNonce = 'a'.repeat(32)

  it('logs missing CF_WORKER_SECRET warning exactly once across multiple requests', async () => {
    const { default: w } = await importWorker()
    const env: Env = {
      BACKEND_ORIGIN: 'https://b.example.com',
      WEB_ORIGIN: 'https://w.example.com',
      CACHE_PLACEHOLDER_NONCE: cachePlaceholderNonce,
    }
    const req = new Request('https://voucha.ai/')

    await w.fetch(req, env, createContext(env))
    await w.fetch(req, env, createContext(env))

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CF_WORKER_SECRET is not set or empty'),
    )
  })

  it('logs too-short CF_WORKER_SECRET warning exactly once across multiple requests', async () => {
    const { default: w } = await importWorker()
    const env: Env = {
      BACKEND_ORIGIN: 'https://b.example.com',
      WEB_ORIGIN: 'https://w.example.com',
      CF_WORKER_SECRET: 'tooshort',
      CACHE_PLACEHOLDER_NONCE: cachePlaceholderNonce,
    }
    const req = new Request('https://voucha.ai/')

    await w.fetch(req, env, createContext(env))
    await w.fetch(req, env, createContext(env))

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CF_WORKER_SECRET is too short'))
  })

  it('logs ambiguous PRODUCTION value error exactly once per module across multiple requests', async () => {
    const { default: w } = await importWorker()
    const env: Env = {
      BACKEND_ORIGIN: 'https://b.example.com',
      WEB_ORIGIN: 'https://w.example.com',
      PRODUCTION: '1',
      CACHE_PLACEHOLDER_NONCE: cachePlaceholderNonce,
    }
    const req = new Request('https://voucha.ai/')

    const firstResponse = await w.fetch(req, env, createContext(env))
    const secondResponse = await w.fetch(req, env, createContext(env))

    // Two console.error calls expected: one for missing CF_WORKER_SECRET and one for the
    // invalid PRODUCTION value. warnIfProductionValueInvalid is centralised in env-validation.mts,
    // so the PRODUCTION warning fires exactly once regardless of how many modules call it.
    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(firstResponse.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(firstResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(firstResponse.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains',
    )
    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("PRODUCTION is set to '1'"))
  })
})
