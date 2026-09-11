import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintUUIDv7 } from '@ts-shared/session-jwt'
import { createSignedDeviceJwt, createSignedSessionJwt } from '../auth/test-jwt-fixtures.mts'
import worker from '../index.mts'
import { fetchInner } from '../request-handler.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

function makeSentryEnvelope(): string {
  return [
    '{"dsn":"https://7a947dd8dc8d498c5b9d212113b1a44c@o4507688154824704.ingest.us.sentry.io/4507688156856320"}',
    '{"type":"event"}',
    '{}',
  ].join('\n')
}

describe('rate limiting', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('returns 429 when rate limit blocks request', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_GET_HEAD: {
        limit: () => ({ success: false }),
      },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({
      message: 'Too Many Requests',
      code: 'RATE_LIMIT',
    })
  })

  it('POST /monitoring forwards to Sentry tunnel and is subject to rate limiting', async () => {
    const sentryFetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('accepted', { status: 200 })),
    ) as unknown as typeof fetch
    globalThis.fetch = sentryFetch

    const validEnvelope = [
      '{"dsn":"https://7a947dd8dc8d498c5b9d212113b1a44c@o4507688154824704.ingest.us.sentry.io/4507688156856320"}',
      '{"type":"event"}',
      '{}',
    ].join('\n')

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: {
        limit: () => ({ success: false }),
      },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/monitoring', {
        method: 'POST',
        body: validEnvelope,
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    // Rate limiter blocks the tunnel request
    expect(response.status).toBe(429)
    expect(sentryFetch).not.toHaveBeenCalled()
  })

  it('returns 400 for POST /monitoring when the ip is absent and a limiter is configured', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('accepted')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: {
        limit: () => ({ success: true }),
      },
    }

    const response = await fetchInner(
      new Request('https://voucha.ai/monitoring', {
        method: 'POST',
        body: makeSentryEnvelope(),
      }),
      env,
      createContext(env),
      'request-id',
      null,
      'nonce',
      "default-src 'self'",
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('POST /monitoring reaches Sentry tunnel when rate limit passes', async () => {
    const sentryFetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('accepted', { status: 200 })),
    ) as unknown as typeof fetch
    globalThis.fetch = sentryFetch

    const validEnvelope = [
      '{"dsn":"https://7a947dd8dc8d498c5b9d212113b1a44c@o4507688154824704.ingest.us.sentry.io/4507688156856320"}',
      '{"type":"event"}',
      '{}',
    ].join('\n')

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await fetchInner(
      new Request('https://voucha.ai/monitoring', {
        method: 'POST',
        body: validEnvelope,
      }),
      env,
      createContext(env),
      'request-id',
      null,
      'nonce',
      "default-src 'self'",
    )

    expect(response.status).toBe(200)
    expect(sentryFetch).toHaveBeenCalledWith(
      'https://o4507688154824704.ingest.us.sentry.io/api/4507688156856320/envelope/',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('POST /monitoring skips session JWT cache classification before reaching Sentry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sentryFetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('accepted', { status: 200 })),
    ) as unknown as typeof fetch
    globalThis.fetch = sentryFetch
    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })
    const sessionToken = await createSignedSessionJwt({
      did,
      uid: mintUUIDv7(),
      sid: mintUUIDv7(),
    })

    const validEnvelope = [
      '{"dsn":"https://7a947dd8dc8d498c5b9d212113b1a44c@o4507688154824704.ingest.us.sentry.io/4507688156856320"}',
      '{"type":"event"}',
      '{}',
    ].join('\n')

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      PRODUCTION: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/monitoring', {
        method: 'POST',
        body: validEnvelope,
        headers: {
          cookie: `dt=${deviceToken}; st=${sessionToken}`,
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(sentryFetch).toHaveBeenCalledWith(
      'https://o4507688154824704.ingest.us.sentry.io/api/4507688156856320/envelope/',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Session JWT verification failed for cache classification'),
    )
  })

  it('continues to rate-limit normal origin routes after resolving the route target', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('origin ok', { status: 200 })),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_GET_HEAD: {
        limit: () => ({ success: true }),
      },
    }

    const response = await fetchInner(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
        },
      }),
      env,
      createContext(env),
      'request-id',
      null,
      'nonce',
      "default-src 'self'",
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://backend.example.com/api/v1/posts' }),
    )
  })

  it('returns 400 (not 429) when cf-connecting-ip is absent and rate limiter is configured', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_GET_HEAD: {
        limit: () => ({ success: true }),
      },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      // No cf-connecting-ip header
      env,
      createContext(env),
    )

    // 400 is more appropriate than 429: retrying after 60 s won't fix a missing IP
    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    // Security headers must be applied even to error responses
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
