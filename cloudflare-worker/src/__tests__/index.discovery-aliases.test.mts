import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler - discovery headers and aliases', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('rewrites plural .md aliases with matching post type filters', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequest = request
      return Promise.resolve(new Response('markdown'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    await worker.fetch(
      new Request('https://voucha.ai/reviews.md?limit=10&after=cursor&post_types=story'),
      env,
      createContext(env),
    )

    const capturedUrl = new URL(capturedRequest?.url ?? '')
    expect(capturedUrl.origin).toBe('https://backend.example.com')
    expect(capturedUrl.pathname).toBe('/md/posts')
    expect(capturedUrl.searchParams.get('limit')).toBe('10')
    expect(capturedUrl.searchParams.get('after')).toBe('cursor')
    expect(capturedUrl.searchParams.get('post_types')).toBe('review')
  })

  it('rewrites markdown alias families to backend markdown routes', async () => {
    const capturedRequests: Request[] = []
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequests.push(request)
      return Promise.resolve(new Response('markdown'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const cases = [
      ['/articles.md', '/md/posts', 'post_types=article'],
      ['/blog.md', '/md/posts', 'post_types=blog_post'],
      ['/data-points.md', '/md/posts', 'post_types=data_point'],
      ['/discussions.md', '/md/posts', 'post_types=discussion'],
      ['/reviews.md', '/md/posts', 'post_types=review'],
      ['/stories.md', '/md/posts', 'post_types=story'],
      ['/topics.md', '/md/topics', ''],
      ['/review/amex-gold.md', '/md/posts/amex-gold', 'post_types=review'],
      ['/blog-post/points-news.md', '/md/posts/points-news', 'post_types=blog_post'],
      ['/card/amex-gold.md', '/md/topics/amex-gold', 'topic_types=card'],
      [
        '/rewards-program/chase-ultimate-rewards.md',
        '/md/topics/chase-ultimate-rewards',
        'topic_types=rewards_program',
      ],
      ['/user/jong.md', '/md/users/jong', ''],
    ] as const

    for (const [path] of cases) {
      await worker.fetch(new Request(`https://voucha.ai${path}`), env, createContext(env))
    }

    expect(capturedRequests).toHaveLength(cases.length)
    cases.forEach(([, expectedPath, expectedSearch], index) => {
      const capturedUrl = new URL(capturedRequests[index]?.url ?? '')
      expect(capturedUrl.origin).toBe('https://backend.example.com')
      expect(capturedUrl.pathname).toBe(expectedPath)
      expect(capturedUrl.searchParams.toString()).toBe(expectedSearch)
    })
  })

  it('does not rewrite unsafe dot-segment markdown aliases to the backend', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    await worker.fetch(new Request('https://voucha.ai/review/..md'), env, createContext(env))
    await worker.fetch(new Request('https://voucha.ai/topic/.md'), env, createContext(env))

    const origins = fetchSpy.mock.calls.map(([request]) => new URL((request as Request).url).origin)
    expect(origins).toEqual(['https://web.example.com', 'https://web.example.com'])
  })

  it('appends discovery links to origin link headers', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('ok', {
          headers: { link: '</_next/app.css>; rel=preload; as=style' },
        }),
      ),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      SITE_ORIGIN: 'https://voucha.ai',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/news'),
      env,
      createContext(env),
    )
    const link = response.headers.get('link')

    expect(link).toContain('</_next/app.css>; rel=preload; as=style')
    expect(link).toContain('<https://voucha.ai/llms.txt>; rel="service-desc"')
  })
})
