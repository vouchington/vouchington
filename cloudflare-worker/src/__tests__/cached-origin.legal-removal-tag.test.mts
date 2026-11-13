import { afterEach, describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'
import type { Env } from '../types.mts'

const routeCases = [
  {
    name: 'thread descendants',
    pathname: '/api/v1/posts/comment-id/descendants',
    audience: 'anon',
    env: { BACKEND_ORIGIN: 'https://backend.example.com' },
    originHeaders: {},
    expectedTags: ['post:comment-id', 'legal-removal'],
  },
  {
    name: 'thread ancestors',
    pathname: '/api/v1/posts/comment-id/ancestors',
    audience: 'anon',
    env: { BACKEND_ORIGIN: 'https://backend.example.com' },
    originHeaders: {},
    expectedTags: ['post:comment-id', 'legal-removal'],
  },
  {
    name: 'list page',
    pathname: '/reviews',
    audience: 'anon',
    env: { WEB_ORIGIN: 'https://web.example.com' },
    originHeaders: { 'content-type': 'text/html' },
    expectedTags: ['html', 'legal-removal'],
  },
  {
    name: 'generic HTML page',
    pathname: '/about',
    audience: 'anon',
    env: { WEB_ORIGIN: 'https://web.example.com' },
    originHeaders: { 'content-type': 'text/html' },
    expectedTags: ['html', 'legal-removal'],
  },
  {
    name: 'RSS response',
    pathname: '/rss/posts',
    audience: 'anon',
    env: { BACKEND_ORIGIN: 'https://backend.example.com' },
    originHeaders: {},
    expectedTags: ['rss', 'legal-removal'],
  },
  {
    name: 'sitemap response',
    pathname: '/sitemaps/posts.xml',
    audience: 'static',
    env: { SITEMAPS_ORIGIN: 'https://sitemaps.example.com' },
    originHeaders: {},
    expectedTags: ['sitemap', 'legal-removal'],
  },
  {
    name: 'post detail with origin user tag',
    pathname: '/api/v1/posts/post-id',
    audience: 'anon',
    env: { BACKEND_ORIGIN: 'https://backend.example.com' },
    originHeaders: { 'Cache-Tag': 'user:author-id' },
    expectedTags: ['post:post-id', 'user:author-id', 'legal-removal'],
  },
] as const

const buildOrigin = (audience: 'anon' | 'static', env: Env) =>
  new CachedOrigin(
    { props: { audience, isRsc: false }, waitUntil: () => {}, passThroughOnException: () => {} },
    env,
  )

describe('CachedOrigin legal removal cache tag', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(routeCases)('adds the legal removal tag to the $name tag set', async route => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('origin', { headers: route.originHeaders })),
    ) as unknown as typeof fetch

    const response = await buildOrigin(route.audience, route.env).fetch(
      new Request(`https://voucha.ai${route.pathname}`),
    )
    const actualTags = response.headers.get('cache-tag')?.split(',').toSorted()

    expect(response.status).toBe(200)
    expect(actualTags).toEqual([...route.expectedTags].toSorted())
  })

  it.each<{ name: string; headers: Record<string, string> }>([
    {
      name: 'private',
      headers: { 'cache-control': 'private, max-age=300', 'Cache-Tag': 'user:author-id' },
    },
    {
      name: 'set-cookie',
      headers: {
        'cache-control': 'public',
        'Cache-Tag': 'user:author-id',
        'set-cookie': 'session=abc; Path=/',
      },
    },
  ])('does not attach cache tags to a $name origin response', async ({ headers }) => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('origin', { headers })),
    ) as unknown as typeof fetch

    const response = await buildOrigin('anon', {
      BACKEND_ORIGIN: 'https://backend.example.com',
    }).fetch(new Request('https://voucha.ai/api/v1/posts/post-id'))

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const cacheTags = response.headers.get('cache-tag')?.split(',') ?? []
    expect(cacheTags).not.toContain('legal-removal')
  })
})
