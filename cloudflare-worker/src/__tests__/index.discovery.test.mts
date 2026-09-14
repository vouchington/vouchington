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
  SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
  SITE_ORIGIN: 'https://voucha.ai',
  WEB_ORIGIN: 'https://web.example.com',
}

describe('worker fetch handler - machine-readable discovery', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('serves the API catalog as public linkset JSON without authenticated resources', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const limiter = { limit: vi.fn<VitestLooseMock>(() => ({ success: true })) }

    const response = await worker.fetch(
      new Request('https://voucha.ai/.well-known/api-catalog'),
      {
        ...baseEnv,
        RATE_LIMITER_GET_HEAD: limiter,
      },
      createContext(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/linkset+json; charset=utf-8')
    const catalog = await response.json()
    const text = JSON.stringify(catalog)
    expect(catalog.linkset[0].anchor).toBe('https://voucha.ai')
    expect(catalog.linkset[0]['service-desc']).toEqual([
      {
        href: 'https://voucha.ai/llms.txt',
        type: 'text/markdown',
        title: 'LLM discovery',
      },
    ])
    expect(catalog.linkset[0].sitemap).toEqual([
      {
        href: 'https://voucha.ai/sitemap.xml',
        type: 'application/xml',
        title: 'Sitemap index',
      },
    ])
    expect(catalog.linkset[0].item).toEqual([
      {
        href: 'https://voucha.ai/md/posts',
        type: 'text/markdown',
        title: 'Public posts as markdown',
      },
      {
        href: 'https://voucha.ai/md/topics',
        type: 'text/markdown',
        title: 'Public topics as markdown',
      },
    ])
    expect(catalog.linkset[0].alternate).toEqual([
      {
        href: 'https://voucha.ai/rss/posts',
        type: 'application/rss+xml',
        title: 'Public posts RSS',
      },
      {
        href: 'https://voucha.ai/rss/news',
        type: 'application/rss+xml',
        title: 'Public news RSS',
      },
    ])
    expect(text).not.toContain('/api/')
    expect(text).not.toContain('/admin/')
    expect(text).not.toContain('/auth/')
    expect(text).not.toContain('/my/')
    expect(text).not.toContain('apikey')
    expect(limiter.limit).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('omits the API catalog sitemap entry when NOINDEX=true', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const limiter = { limit: vi.fn<VitestLooseMock>(() => ({ success: true })) }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/.well-known/api-catalog'),
      {
        ...baseEnv,
        NOINDEX: 'true',
        RATE_LIMITER_GET_HEAD: limiter,
        SITE_ORIGIN: 'https://staging.voucha.ai',
      },
      createContext(),
    )

    const catalog = await response.json()
    expect(response.status).toBe(200)
    expect(catalog.linkset[0].anchor).toBe('https://staging.voucha.ai')
    expect(catalog.linkset[0].sitemap).toEqual([])
    expect(JSON.stringify(catalog)).not.toContain('sitemap.xml')
    expect(limiter.limit).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('describes only public unauthenticated resources in llms.txt', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/llms.txt'),
      baseEnv,
      createContext(),
    )

    const body = await response.text()
    expect(body).toContain('Only public unauthenticated content is advertised here')
    expect(body).toContain('/md/posts')
    expect(body).toContain('/md/topics')
    expect(body).toContain('/md/users/{username}')
    expect(body).toContain('/rss/posts')
    expect(body).toContain('/rss/news')
    expect(body).not.toContain('/api/')
    expect(body).not.toContain('/admin/')
    expect(body).not.toContain('/auth/')
    expect(body).not.toContain('/my/')
  })

  it('adds site-level Link headers to public web responses', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      baseEnv,
      createContext(),
    )

    const link = response.headers.get('link')
    expect(link).toContain('<https://voucha.ai/llms.txt>; rel="service-desc"')
    expect(link).toContain(
      '<https://voucha.ai/.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"',
    )
    expect(link).toContain('<https://voucha.ai/sitemap.xml>; rel="sitemap"')
  })

  it('omits sitemap Link headers but preserves other discovery links when NOINDEX=true', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/about'),
      {
        ...baseEnv,
        NOINDEX: 'true',
        SITE_ORIGIN: 'https://staging.voucha.ai',
      },
      createContext(),
    )

    const link = response.headers.get('link')
    expect(link).toContain('<https://staging.voucha.ai/llms.txt>; rel="service-desc"')
    expect(link).toContain(
      '<https://staging.voucha.ai/.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"',
    )
    expect(link).not.toContain('sitemap.xml')
  })

  it('preserves discovery Link headers on cached public static asset responses', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('ok')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    // target==='web' static assets only dispatch to CachedOrigin when the
    // placeholder-nonce secret is configured and meets the minimum length
    // (see request-handler.mts's canUseCachedOriginForWeb) — createContext(env)
    // must receive the same env so the mock's real CachedOrigin instance also
    // has WEB_ORIGIN etc.
    const env: Env = {
      ...baseEnv,
      CACHE_PLACEHOLDER_NONCE: 'test-placeholder-nonce-that-is-at-least-32-characters-long',
    }

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/favicon.ico'),
      env,
      createContext(env),
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/favicon.ico'),
      env,
      createContext(env),
    )

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('adds Link headers to edge-owned discovery and sitemap responses', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) =>
      Promise.resolve(new Response(request.url)),
    ) as unknown as typeof fetch

    const llmsResponse = await worker.fetch(
      new Request('https://voucha.ai/llms.txt'),
      baseEnv,
      createContext(),
    )
    const catalogResponse = await worker.fetch(
      new Request('https://voucha.ai/.well-known/api-catalog'),
      baseEnv,
      createContext(),
    )
    const sitemapResponse = await worker.fetch(
      new Request('https://voucha.ai/sitemap.xml'),
      baseEnv,
      createContext(),
    )

    expect(llmsResponse.headers.get('link')).toContain('<https://voucha.ai/sitemap.xml>')
    expect(catalogResponse.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
    expect(sitemapResponse.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
  })

  it('adds route-specific anonymous RSS Link headers for public topic pages', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const cases = [
      [
        'https://voucha.ai/rewards-program/world-of-hyatt/posts?post_types=review',
        '</rss/posts?topics=world-of-hyatt&post_type=review>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/rewards-program/world-of-hyatt/posts',
        '</rss/posts?topics=world-of-hyatt>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/rewards-program/world-of-hyatt/posts?post_types=story',
        '</rss/posts?topics=world-of-hyatt>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/card/chase-sapphire-reserve/reviews',
        '</rss/posts?topics=chase-sapphire-reserve&post_type=review>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/topic/test/data-points',
        '</rss/posts?topics=test&post_type=data_point>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/source/the-points-guy/latest',
        '</rss/news?sources=the-points-guy>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/card/chase-sapphire-reserve/latest',
        '</rss/news?topics=chase-sapphire-reserve>; rel="alternate"; type="application/rss+xml"',
      ],
      [
        'https://voucha.ai/rewards-program/world-of-hyatt/news',
        '</rss/news?category_topic=world-of-hyatt>; rel="alternate"; type="application/rss+xml"',
      ],
    ] as const

    const responses = await Promise.all(
      cases.map(([url]) => worker.fetch(new Request(url), baseEnv, createContext())),
    )
    cases.forEach(([, expectedLink], index) => {
      expect(responses[index]?.headers.get('link')).toContain(expectedLink)
    })
  })
})
