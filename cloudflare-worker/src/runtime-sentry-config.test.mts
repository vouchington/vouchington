import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index.mts'
import { getRuntimeSentryConfigResponse } from './runtime-sentry-config.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/src/mock-env.mts'
import type { Env } from './types.mts'

const CONFIG_URL = 'https://example.test/runtime-sentry-config.js'

describe('runtime Sentry config response', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('serves validated runtime Sentry config as uncached JavaScript', async () => {
    const response = getRuntimeSentryConfigResponse(new Request(CONFIG_URL), {
      ENVIRONMENT: 'production',
      SENTRY_WEB_DSN: 'https://public@example.test/123',
    })

    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(response?.headers.get('content-type')).toBe('application/javascript; charset=utf-8')
    const body = await response?.text()
    expect(body).toContain('voucha:runtime-public-config-ready')
    expect(body).toContain('https://public@example.test/123')
  })

  it('does not publish malformed Sentry configuration', async () => {
    const response = getRuntimeSentryConfigResponse(new Request(CONFIG_URL), {
      ENVIRONMENT: 'production',
      SENTRY_WEB_DSN: 'invalid-private-value',
    })

    await expect(response?.text()).resolves.not.toContain('invalid-private-value')
  })

  it('handles only same-path GET and HEAD requests', () => {
    expect(getRuntimeSentryConfigResponse(new Request('https://example.test/other'), {})).toBeNull()
    expect(
      getRuntimeSentryConfigResponse(new Request(CONFIG_URL, { method: 'POST' }), {}),
    ).toBeNull()
    expect(
      getRuntimeSentryConfigResponse(new Request(CONFIG_URL, { method: 'HEAD' }), {})?.body,
    ).toBeNull()
  })

  it('intercepts the real Worker path without an origin fetch or session cookie', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.test',
      ENVIRONMENT: 'production',
      SENTRY_WEB_DSN: 'https://public@example.test/123',
      WEB_ORIGIN: 'https://web.example.test',
    }

    const response = await worker.fetch(new Request(CONFIG_URL), env, createContext(env))

    expect(await response.text()).toContain('voucha:runtime-public-config-ready')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
