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

  it('strips session cookies for bot traffic', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      return Promise.resolve(new Response(request.headers.get('cookie') || ''))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      BOT_CACHE_TTL_SECONDS: '86400',
      ANON_CACHE_TTL_SECONDS: '30',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: {
          'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          cookie: 'st=token; dt=device; foo=bar',
        },
      }),
      env,
      createContext(env),
    )

    expect(await response.text()).toBe('foo=bar')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('robots.txt is served inline with correct content-type and no origin fetch', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITE_ORIGIN: 'https://voucha.ai',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/robots.txt'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain')
    const body = await response.text()
    expect(body).toContain('User-agent: *')
    expect(body).toContain('Sitemap: https://voucha.ai/sitemap.xml')
    // Each AI crawler block must contain Allow: / and all ROBOTS_DISALLOW_PREFIXES,
    // and must not appear in another bot's block.
    for (const bot of AI_CRAWLERS) {
      const botIndex = body.indexOf(`User-agent: ${bot}\n`)
      expect(botIndex).toBeGreaterThan(-1)
      // Find the text between this bot's User-agent line and the next blank line
      const blockStart = botIndex
      const blockEnd = body.indexOf('\n\n', blockStart)
      const block = body.slice(blockStart, blockEnd === -1 ? undefined : blockEnd)
      expect(block).toContain('Allow: /')
      for (const path of ROBOTS_DISALLOW_PREFIXES) {
        expect(block).toContain(`Disallow: ${path}`)
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('robots.txt uses the production site origin fallback when SITE_ORIGIN is unset', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/robots.txt'),
      env,
      createContext(env),
    )

    expect(await response.text()).toContain('Sitemap: https://voucha.ai/sitemap.xml')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('robots.txt disallows crawling and omits sitemap discovery when NOINDEX=true', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITE_ORIGIN: 'https://staging.voucha.ai',
      NOINDEX: 'true',
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/robots.txt'),
      env,
      createContext(env),
    )

    const body = await response.text()
    const link = response.headers.get('link')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(link).toContain('<https://staging.voucha.ai/llms.txt>; rel="service-desc"')
    expect(link).not.toContain('sitemap.xml')
    expect(body).toBe('User-agent: *\nDisallow: /\n')
    expect(body).not.toContain('Sitemap:')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('llms.txt is served inline with markdown content-type and no origin fetch', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/llms.txt'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('link')).toContain('<https://voucha.ai/llms-full.txt>')
    expect(response.headers.get('no-vary-search')).toBeNull()
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
    const body = await response.text()
    expect(body).toContain('# Voucha')
    expect(body).toContain('/review/example.md')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('llms-full.txt is served inline with bounded full-index policy', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/llms-full.txt'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(await response.text()).toContain('Full Index Policy')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves applicable well-known discovery documents inline', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITE_ORIGIN: 'https://voucha.ai',
    }

    const security = await worker.fetch(
      new Request('https://voucha.ai/.well-known/security.txt'),
      env,
      createContext(env),
    )
    expect(security.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    const securityText = await security.text()
    expect(securityText).toContain('Contact: mailto:security@voucha.ai')
    expect(securityText).toContain('Canonical: https://voucha.ai/.well-known/security.txt')
    expect(securityText).toContain('Expires: 2027-12-31T23:59:59Z')

    const catalog = await worker.fetch(
      new Request('https://voucha.ai/.well-known/api-catalog'),
      env,
      createContext(env),
    )
    expect(catalog.headers.get('content-type')).toBe('application/linkset+json; charset=utf-8')
    const catalogBody = await catalog.json()
    expect(catalogBody.linkset[0].anchor).toBe('https://voucha.ai')
    expect(catalogBody.linkset[0]['service-desc']).toEqual([
      {
        href: 'https://voucha.ai/llms.txt',
        type: 'text/markdown',
        title: 'LLM discovery',
      },
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rewrites .md aliases to backend markdown routes', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequest = request
      return Promise.resolve(new Response('markdown'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/review/amex-gold.md'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(capturedRequest?.url).toBe(
      'https://backend.example.com/md/posts/amex-gold?post_types=review',
    )
  })
})
