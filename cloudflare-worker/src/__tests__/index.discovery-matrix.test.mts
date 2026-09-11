/**
 * Data-driven discovery leak verifier.
 *
 * These tests derive coverage from the @ts-shared/route-classification manifest so that
 * adding a new private path pattern to the manifest automatically adds a test assertion here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PRIVATE_DISCOVERY_EXACT_PATHS,
  PRIVATE_DISCOVERY_PREFIXES,
  ROBOTS_DISALLOW_PREFIXES,
} from '@ts-shared/route-classification'

import worker from '../index.mts'

import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'

import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
  SITE_ORIGIN: 'https://voucha.ai',
  WEB_ORIGIN: 'https://web.example.com',
}

describe('worker fetch handler - discovery manifest leak verifier', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('suppresses Link headers for every PRIVATE_DISCOVERY_EXACT_PATHS entry', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const paths = [...PRIVATE_DISCOVERY_EXACT_PATHS]
    const responses = await Promise.all(
      paths.map(path =>
        worker.fetch(new Request(`https://voucha.ai${path}`), baseEnv, createContext()),
      ),
    )
    const leaking: string[] = []
    for (const [i, response] of responses.entries()) {
      if (response.headers.get('link') !== null) {
        leaking.push(paths[i]!)
      }
    }
    expect(leaking).toEqual([])
  })

  it('suppresses Link headers for a request under each PRIVATE_DISCOVERY_PREFIXES entry', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    // For each prefix, fetch a representative child path
    const prefixPaths = PRIVATE_DISCOVERY_PREFIXES.map(prefix => `${prefix}test-path`)
    const responses = await Promise.all(
      prefixPaths.map(path =>
        worker.fetch(new Request(`https://voucha.ai${path}`), baseEnv, createContext()),
      ),
    )
    const leaking: string[] = []
    for (const [i, response] of responses.entries()) {
      if (response.headers.get('link') !== null) {
        leaking.push(PRIVATE_DISCOVERY_PREFIXES[i]!)
      }
    }
    expect(leaking).toEqual([])
  })

  it('suppresses Link headers for representative regex-classified private paths', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    // PRIVATE_TOPIC_MANAGEMENT_RE: /<entity>/<slug>/(settings|tags|validations)
    // PRIVATE_DYNAMIC_ROUTE_PATTERNS: post edit/tags, create, community mgmt, url detail, user admin+lists
    const regexPaths = [
      '/topic/world-of-hyatt/settings',
      '/card/chase-sapphire/tags',
      '/rewards-program/amex/validations',
      '/source/nytimes/settings',
      '/review/my-review/edit',
      '/article/my-article/tags',
      '/discussions/create',
      '/communities/my-club/settings',
      '/communities/my-club/apply',
      '/url/abc-123',
      '/user/jongle/admin',
      '/user/jongle/topics/blocked',
      '/user/jongle/posts/saved',
      '/user/jongle/communities/proxy-muted',
    ]

    const responses = await Promise.all(
      regexPaths.map(path =>
        worker.fetch(new Request(`https://voucha.ai${path}`), baseEnv, createContext()),
      ),
    )
    const leaking: string[] = []
    for (const [i, response] of responses.entries()) {
      if (response.headers.get('link') !== null) {
        leaking.push(regexPaths[i]!)
      }
    }
    expect(leaking).toEqual([])
  })

  it('suppresses Link headers for URLs carrying an apikey query param', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const apikeyUrls = [
      'https://voucha.ai/rewards-program/world-of-hyatt/posts?apikey=fil_secret',
      'https://voucha.ai/rss/posts?apikey=fil_secret',
      'https://voucha.ai/topic/chase-sapphire/posts?apikey=fil_secret',
    ]

    const responses = await Promise.all(
      apikeyUrls.map(url => worker.fetch(new Request(url), baseEnv, createContext())),
    )
    responses.forEach(response => {
      expect(response.headers.get('link')).toBeNull()
    })
  })

  it('/llms.txt body does not advertise private prefixes or apikey= query params', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/llms.txt'),
      baseEnv,
      createContext(),
    )

    expect(response.status).toBe(200)
    const body = await response.text()

    // Deliberately a subset of PRIVATE_DISCOVERY_PREFIXES — not the full list. Iterating
    // the full PRIVATE_DISCOVERY_PREFIXES would produce false positives: e.g. '/users/'
    // appears in '/md/users/' which the body legitimately advertises.
    const forbiddenPatterns = ['/api/', '/admin/', '/auth/', '/my/', '/feed/']
    const foundPrivate = forbiddenPatterns.filter(pattern => body.includes(pattern))
    expect(foundPrivate).toEqual([])
    // "apikey=" (as a query param, not the word "apikey" which appears in prose) must not appear
    expect(body).not.toContain('apikey=')
    // Must advertise the "Only public unauthenticated content" sentinel
    expect(body).toContain('Only public unauthenticated content is advertised here')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('/.well-known/api-catalog body does not advertise private prefixes or apikey= query params', async () => {
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
    const text = JSON.stringify(await response.json())

    // Deliberately a subset of PRIVATE_DISCOVERY_PREFIXES — not the full list. Iterating
    // the full PRIVATE_DISCOVERY_PREFIXES would produce false positives: e.g. '/users/'
    // appears in '/md/users/' which the body legitimately advertises.
    const forbiddenPatterns = ['/api/', '/admin/', '/auth/', '/my/', '/feed/']
    const foundPrivate = forbiddenPatterns.filter(pattern => text.includes(pattern))
    expect(foundPrivate).toEqual([])
    expect(text).not.toContain('apikey=')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('every ROBOTS_DISALLOW_PREFIXES entry suppresses Link headers', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const robotsPaths = ROBOTS_DISALLOW_PREFIXES.map(prefix => {
      const exactPath = prefix.replace(/\$$/, '')
      if (exactPath.endsWith('/')) return `${exactPath}test-page`
      if (exactPath.endsWith('?')) return `${exactPath}status=resolved`
      return exactPath
    })
    const responses = await Promise.all(
      robotsPaths.map(path =>
        worker.fetch(new Request(`https://voucha.ai${path}`), baseEnv, createContext()),
      ),
    )
    const leaking: string[] = []
    for (const [i, response] of responses.entries()) {
      if (response.headers.get('link') !== null) {
        leaking.push(robotsPaths[i]!)
      }
    }
    expect(leaking).toEqual([])
  })
})
