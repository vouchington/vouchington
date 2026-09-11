import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../index.mts'

import { ROBOTS_DISALLOW_PREFIXES } from '@ts-shared/route-classification'

import { AI_CRAWLERS } from '../robots-txt.mts'

import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'

import type { Env } from '../types.mts'

describe('worker fetch handler — response headers and edge behaviors', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('returns maintenance 503 with retry-after when maintenance mode is enabled', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_RETRY_AFTER_SECONDS: '120',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/news'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('120')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('echoes Global Privacy Control as an edge privacy signal', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/news', { headers: { 'sec-gpc': '1' } }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-gpc')).toBe('1')
  })

  it('POST requests forward body to origin', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((req: Request) => {
      capturedRequest = req
      return Promise.resolve(new Response('created', { status: 201 }))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const body = JSON.stringify({ title: 'hello' })
    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(201)
    expect(capturedRequest?.method).toBe('POST')
    expect(await capturedRequest?.text()).toBe(body)
  })

  it('3xx responses are forwarded as-is without following the redirect', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response(null, {
          status: 301,
          headers: { location: 'https://voucha.ai/new-path' },
        }),
      ),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/old-path'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('https://voucha.ai/new-path')
  })

  it('x-request-id is set on all responses (dispatched, bypassed, errors)', async () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    // Dispatched (cacheable) response
    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )
    expect(firstResponse.headers.get('x-request-id')).toMatch(uuidPattern)

    // Second dispatch to the same path — the platform HIT/MISS split isn't
    // observable from the worker (see cached-origin.mts), so this only ever
    // reports 'DISPATCHED' here, but x-request-id is still applied
    // unconditionally by the gateway on every response path.
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-request-id')).toMatch(uuidPattern)
    // Each request gets a fresh, unique ID
    expect(secondResponse.headers.get('x-request-id')).not.toBe(
      firstResponse.headers.get('x-request-id'),
    )

    // Error response (missing IP when rate limiter configured → 400)
    const rateLimitEnv: Env = {
      ...env,
      RATE_LIMITER_GET_HEAD: { limit: () => ({ success: false }) },
    }
    const errorResponse = await worker.fetch(
      new Request('https://voucha.ai/'),
      rateLimitEnv,
      createContext(),
    )
    expect(errorResponse.status).toBe(400)
    expect(errorResponse.headers.get('x-request-id')).toMatch(uuidPattern)

    // Error response (missing IP when only bot rate limiter configured → 400, not 429)
    const botRateLimitEnv: Env = {
      ...env,
      RATE_LIMITER_BOT_GET_HEAD: { limit: () => ({ success: false }) },
    }
    const botErrorResponse = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: { 'user-agent': 'MyGenericBot/1.0' },
      }),
      botRateLimitEnv,
      createContext(),
    )
    expect(botErrorResponse.status).toBe(400)
  })

  it('server-timing header is set on origin responses', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )

    expect(response.headers.get('server-timing')).toMatch(/^origin;dur=\d+$/)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof AI_CRAWLERS)
  void (0 as unknown as typeof ROBOTS_DISALLOW_PREFIXES)
})
