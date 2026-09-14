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

  it('skips route-specific RSS Link headers for UUID topic route segments', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/topic/550e8400-e29b-41d4-a716-446655440000/posts'),
      baseEnv,
      createContext(),
    )

    expect(response.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
    expect(response.headers.get('link')).not.toContain('/rss/posts?topics=')
  })

  it('adds a route-specific anonymous RSS Link header for public user profiles', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/user/jongle'),
      baseEnv,
      createContext(),
    )

    expect(response.headers.get('link')).toContain(
      '</rss/posts?user=jongle>; rel="alternate"; type="application/rss+xml"',
    )
  })

  it('skips route-specific RSS Link headers for malformed public path segments', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const topicResponse = await worker.fetch(
      new Request('https://voucha.ai/topic/%E0%A4%A/posts'),
      baseEnv,
      createContext(),
    )
    const userResponse = await worker.fetch(
      new Request('https://voucha.ai/user/%E0%A4%A'),
      baseEnv,
      createContext(),
    )

    expect(topicResponse.status).toBe(200)
    expect(userResponse.status).toBe(200)
    expect(topicResponse.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
    expect(userResponse.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
    expect(topicResponse.headers.get('link')).not.toContain('/rss/posts?topics=')
    expect(userResponse.headers.get('link')).not.toContain('/rss/posts?user=')
  })

  it('does not add discovery Link headers to private or authenticated surfaces', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const privateUrls = [
      'https://voucha.ai/my/profile',
      'https://voucha.ai/api/v1/my/profile',
      'https://voucha.ai/My/profile',
      'https://voucha.ai/API/v1/my/profile',
      'https://voucha.ai/crm',
      'https://voucha.ai/topic/abc-123/settings/about',
      'https://voucha.ai/topic/abc-123/tags/topic',
      'https://voucha.ai/referral-program/abc-123/validations/new',
      'https://voucha.ai/story/foo/tags/topic',
      'https://voucha.ai/user/jongle/admin',
      'https://voucha.ai/user/jongle/rss-feed-items/saved',
      'https://voucha.ai/user/jongle/rss-feed-items/hidden',
      'https://voucha.ai/user/jongle/rss-feed-items/viewed',
      'https://voucha.ai/user/jongle/rss-feeds/subscribed',
      'https://voucha.ai/user/jongle/rss-feeds/muted',
      'https://voucha.ai/user/jongle/posts/saved',
      'https://voucha.ai/user/jongle/posts/hidden',
      'https://voucha.ai/user/jongle/posts/following',
      'https://voucha.ai/user/jongle/posts/subscribed',
      'https://voucha.ai/user/jongle/topics/blocked',
      'https://voucha.ai/user/jongle/topics/muted',
      'https://voucha.ai/user/jongle/topics/viewed',
      'https://voucha.ai/user/jongle/topics/subscribed-posts',
      'https://voucha.ai/user/jongle/topics/subscribed-news',
      'https://voucha.ai/user/jongle/topics/dismissed-recommendations',
      'https://voucha.ai/user/jongle/users/blocked',
      'https://voucha.ai/user/jongle/users/muted',
      'https://voucha.ai/user/jongle/users/subscribed-posts',
      'https://voucha.ai/user/jongle/users/dismissed-recommendations',
      'https://voucha.ai/user/jongle/urls/saved',
      'https://voucha.ai/user/jongle/domains/blocked',
      'https://voucha.ai/user/jongle/domains/muted',
      'https://voucha.ai/user/jongle/communities/saved',
      'https://voucha.ai/user/jongle/communities/proxy-following',
      'https://voucha.ai/user/jongle/communities/proxy-muted',
      'https://voucha.ai/communities/test-community/settings',
      'https://voucha.ai/users',
      'https://voucha.ai/urls',
      'https://voucha.ai/topic-recommendations/create',
    ]

    const responses = await Promise.all(
      privateUrls.map(url => worker.fetch(new Request(url), baseEnv, createContext())),
    )
    responses.forEach(response => expect(response.headers.get('link')).toBeNull())
  })

  it('does not suppress public paths that only share a private route prefix string', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/monitoring-dashboard'),
      baseEnv,
      createContext(),
    )

    expect(response.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
  })

  it('keeps public comment permalinks discoverable', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/review/some-post/comment/comment-id'),
      baseEnv,
      createContext(),
    )

    expect(response.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
  })

  it('keeps public collection pages discoverable while excluding their create children', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const publicResponse = await worker.fetch(
      new Request('https://voucha.ai/reviews'),
      baseEnv,
      createContext(),
    )
    const createResponse = await worker.fetch(
      new Request('https://voucha.ai/reviews/create'),
      baseEnv,
      createContext(),
    )

    expect(publicResponse.headers.get('link')).toContain('<https://voucha.ai/llms.txt>')
    expect(createResponse.headers.get('link')).toBeNull()
  })

  it('never echoes RSS apikey query parameters in discovery Link headers', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/rewards-program/world-of-hyatt/posts?apikey=fil_secret'),
      baseEnv,
      createContext(),
    )

    expect(response.headers.get('link')).toBeNull()
  })
})
