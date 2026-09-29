import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const env: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
  ANON_CACHE_TTL_SECONDS: '30',
  BOT_CACHE_TTL_SECONDS: '86400',
  SITEMAP_CACHE_TTL_SECONDS: '86400',
}

describe('worker sideload routes', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('rejects a removed apex sideload route before cache or origin', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((_request: Request): Promise<Response> => {
      return Promise.resolve(new Response('web 404', { status: 404 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')
    const response = await worker.fetch(
      new Request('https://voucha.ai/sideload/image/test.jpg'),
      env,
      context,
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'REMOVED_MEDIA_ROUTE' })
    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('forwards the current sideload route to the web origin without the shared cache', async () => {
    let capturedRequest: Request | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response('web ok', { status: 200 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')
    const response = await worker.fetch(
      new Request('https://voucha.ai/sideload/v2/token'),
      env,
      context,
    )

    expect(response.status).toBe(200)
    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(capturedRequest?.url).toBe('https://web.example.com/sideload/v2/token')
  })
})
