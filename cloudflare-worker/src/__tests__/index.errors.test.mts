import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('configuration errors', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('returns 502 when SITEMAPS_ORIGIN is not configured for sitemap routes', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/sitemap.xml'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(502)
  })

  it('returns 502 when BACKEND_ORIGIN is not configured for backend routes', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      // BACKEND_ORIGIN intentionally omitted
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(502)
  })

  it('returns 502 when WEB_ORIGIN is not configured for web routes', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      // WEB_ORIGIN intentionally omitted
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(502)
  })

  it('returns 502 when origin fetch throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.reject(new Error('origin unavailable')),
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

    expect(response.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledWith(
      'Origin fetch failed:',
      expect.objectContaining({ message: 'origin unavailable' }),
    )
  })
})
