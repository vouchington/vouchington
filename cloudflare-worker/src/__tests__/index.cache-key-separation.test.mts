import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintUUIDv7 } from '@ts-shared/session-jwt'
import worker from '../index.mts'
import { createSignedDeviceJwt, createSignedSessionJwt } from '../auth/test-jwt-fixtures.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — cache key separation', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  // Under Workers Cache, the platform partitions its shared cache by
  // (entrypoint, canonical request, ctx.props) — the worker itself never sees a
  // real HIT (CachedOrigin.fetch only runs on a platform MISS, see
  // cached-origin.mts), so `x-voucha-cache` can only ever report 'DISPATCHED'
  // here. The property these tests actually need to prove — that a request
  // dispatched for one audience can never be satisfied by another audience's
  // cache entry — is verified by spying on `context.exports.CachedOrigin.fetch`
  // and asserting the `props.audience` passed through, which is the exact
  // dimension the platform partitions by.
  it('dispatches bot and anonymous requests to distinct cache partitions', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const botRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    })
    await worker.fetch(botRequest, env, context)

    // Anonymous human request to the same path — must never be able to read
    // the bot partition's entry.
    const anonRequest = new Request('https://voucha.ai/api/v1/posts')
    await worker.fetch(anonRequest, env, context)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(dispatchSpy).toHaveBeenCalledTimes(2)
    const [, botInit] = dispatchSpy.mock.calls[0]
    const [, anonInit] = dispatchSpy.mock.calls[1]
    expect(botInit.props.audience).toBe('bot')
    expect(anonInit.props.audience).toBe('anon')
    expect(botInit.props.audience).not.toBe(anonInit.props.audience)
  })

  // Pre-Stage-1, `cache-writeback.mts::writeAnonAndBotCache` warmed the bot
  // cache from an anon origin fetch as an optimization. Workers Cache can't do
  // that: anon/bot are independent `props.audience` partitions, each only
  // populated by its own dispatch (see the plan's "Removing the dual-write"
  // section). This is an accepted regression — bounded to one extra origin
  // fetch per (path, audience) per TTL window — not something to restore here.
  it('anon and bot requests each dispatch independently now that the dual-write is removed', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const anonRequest = new Request('https://voucha.ai/api/v1/posts')
    await worker.fetch(anonRequest, env, context)

    const botRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    })
    await worker.fetch(botRequest, env, context)

    // No cross-audience shortcut remains — the origin is hit for both.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [, anonInit] = dispatchSpy.mock.calls[0]
    const [, botInit] = dispatchSpy.mock.calls[1]
    expect(anonInit.props.audience).toBe('anon')
    expect(botInit.props.audience).toBe('bot')
  })

  it('repeated bot requests share a partition that an anon request to the same path does not', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const botRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    })
    await worker.fetch(botRequest, env, context)

    const botRequest2 = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    })
    await worker.fetch(botRequest2, env, context)

    const anonRequest = new Request('https://voucha.ai/api/v1/posts')
    await worker.fetch(anonRequest, env, context)

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const [, botInit1] = dispatchSpy.mock.calls[0]
    const [, botInit2] = dispatchSpy.mock.calls[1]
    const [, anonInit] = dispatchSpy.mock.calls[2]
    expect(botInit1.props.audience).toBe('bot')
    expect(botInit2.props.audience).toBe(botInit1.props.audience)
    expect(anonInit.props.audience).toBe('anon')
    expect(anonInit.props.audience).not.toBe(botInit1.props.audience)
  })

  it('marks anonymous backend responses as auth-varying and bypasses the same URL after sign-in', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    // Exercise the anonymous response for the exact URL used after sign-in.
    const anonRequest = new Request('https://voucha.ai/api/v1/posts')
    const anonResponse = await worker.fetch(anonRequest, env, createContext(env))
    expect(anonResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(anonResponse.headers.get('vary')).toBe('Cookie, Authorization')

    // Authenticated request must bypass for the same URL.
    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })
    const token = await createSignedSessionJwt({
      did,
      uid: mintUUIDv7(),
      sid: mintUUIDv7(),
    })
    const authRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { cookie: `st=${token}; dt=${deviceToken}` },
    })
    const authResponse = await worker.fetch(authRequest, env, createContext(env))
    expect(authResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('anon and bot each get their own TTL in cache-control', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    // Anon request — check max-age=30
    const anonRequest = new Request('https://voucha.ai/api/v1/posts')
    const anonResponse = await worker.fetch(anonRequest, env, createContext(env))
    expect(anonResponse.headers.get('cache-control')).toContain('max-age=30')

    // Bot request dispatches independently (see the dual-write-removed test
    // above) but still gets its own bot TTL — check max-age=86400
    const botRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    })
    const botResponse = await worker.fetch(botRequest, env, createContext(env))
    expect(botResponse.headers.get('cache-control')).toContain('max-age=86400')
  })

  // SUPPORTED_UI_LOCALES now includes es/fr/pt (see edge-ui-locale.mts), so the
  // anon `lang` partition is live: omitAtDefaultLocale still drops it at
  // DEFAULT_UI_LOCALE (English, the common case) but includes it once
  // resolveEdgeUiLocale resolves a real request to a non-default locale.
  it('omits lang from the anon dispatch props at the default UI locale', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const anonRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'accept-language': 'en' },
    })
    await worker.fetch(anonRequest, env, context)

    const [, anonInit] = dispatchSpy.mock.calls[0]
    expect(anonInit.props.lang).toBeUndefined()
  })

  it('includes lang in the anon dispatch props for a supported non-default UI locale', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('origin')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const anonRequest = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'accept-language': 'fr' },
    })
    await worker.fetch(anonRequest, env, context)

    const [, anonInit] = dispatchSpy.mock.calls[0]
    expect(anonInit.props.lang).toBe('fr')
  })

  it('fully-cached routes share a single cache partition across audiences', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('sitemap-body')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    // Bot request to sitemap
    const botRequest = new Request('https://voucha.ai/sitemap.xml', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    })
    await worker.fetch(botRequest, env, context)

    // Anon request to the same sitemap — cache-policy.mts computes
    // `audience: 'static'` for fully-cached routes before the bot/anon branch
    // is ever reached, so both requests land on the same partition.
    const anonRequest = new Request('https://voucha.ai/sitemap.xml')
    await worker.fetch(anonRequest, env, context)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [botDispatchRequest, botInit] = dispatchSpy.mock.calls[0]
    const [anonDispatchRequest, anonInit] = dispatchSpy.mock.calls[1]
    expect(botInit.props.audience).toBe('static')
    expect(anonInit.props.audience).toBe('static')
    expect(botDispatchRequest.url).toBe(anonDispatchRequest.url)
  })
})
