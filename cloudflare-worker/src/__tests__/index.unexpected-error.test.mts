import { describe, expect, it, vi } from 'vitest'
import { createWorker } from '../index.mts'
import type { WorkerExceptionTags } from '../sentry.mts'
import { createContext } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker unexpected-error boundary', () => {
  it('captures fetchInner rejections and returns a standardized secured 500', async () => {
    const error = new Error('unexpected failure')
    const captureException = vi.fn<(error: unknown, tags?: WorkerExceptionTags) => void>()
    const worker = createWorker({
      fetchInner: () => Promise.reject(error),
      captureException,
    })
    const env = { WEB_ORIGIN: 'https://web.example.com' } as Env

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(captureException).toHaveBeenCalledWith(error, {
      routeTarget: 'web',
      botTier: null,
      requestId: response.headers.get('x-request-id'),
    })
  })

  it('returns a secured fallback when browser-upload origins are malformed', async () => {
    const captureException = vi.fn<(error: unknown, tags?: WorkerExceptionTags) => void>()
    const worker = createWorker({ captureException })
    const env = {
      WEB_ORIGIN: 'https://web.example.com',
      CSP_BROWSER_UPLOAD_ORIGINS: 'malformed',
    } as Env

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(captureException).toHaveBeenCalledOnce()
  })

  it('captures failures before fetchInner and returns a standardized secured 500', async () => {
    const error = new Error('route resolution failed')
    const captureException = vi.fn<(error: unknown, tags?: WorkerExceptionTags) => void>()
    const fetchInner = vi.fn<() => Promise<Response>>()
    const worker = createWorker({
      fetchInner,
      captureException,
      resolveRoute: () => {
        throw error
      },
    })
    const env = { WEB_ORIGIN: 'https://web.example.com' } as Env

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    expect(fetchInner).not.toHaveBeenCalled()
    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    })
    expect(captureException).toHaveBeenCalledWith(error, {
      routeTarget: undefined,
      botTier: null,
      requestId: response.headers.get('x-request-id'),
    })
  })

  it('returns the secured fallback when bindings and error reporting both fail', async () => {
    const worker = createWorker({
      captureException: () => {
        throw new Error('reporting unavailable')
      },
    })

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      undefined as unknown as Env,
      createContext({}),
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  })

  it('standardizes a rejected rate-limiter Promise as a secured 500', async () => {
    const worker = createWorker()
    const env = {
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_GET_HEAD: {
        limit: () => Promise.reject(new Error('rate limiter unavailable')),
      },
    } as Env

    const response = await worker.fetch(
      new Request('https://voucha.ai/about', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  })

  it('standardizes a rejected CachedOrigin dispatch RPC', async () => {
    const worker = createWorker()
    const env = {
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      CACHE_PLACEHOLDER_NONCE: 'placeholder-secret-at-least-32-chars',
    } as Env
    const context = createContext(env)
    context.exports.CachedOrigin.fetch = () => Promise.reject(new Error('dispatch unavailable'))

    const response = await worker.fetch(new Request('https://voucha.ai/about'), env, context)

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    })
  })
})
