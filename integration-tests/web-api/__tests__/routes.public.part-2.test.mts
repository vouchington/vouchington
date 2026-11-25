import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import * as clientRoutes from '@/lib/api/client'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
} from '../../../backend/test-helpers/index.mts'
import {
  createWebApiTestServer,
  buildWebApiTestProxyHeaders,
  createWebApiTestCookieHeader,
} from '../routes.mts'
import {
  closeWebApiClientRuntime,
  createLoopbackClientFetch,
  listenOnFetchSafeLoopback,
  withWebApiClientRuntime,
} from 'vouchington-tooling/integration-test-helpers'

describe('routes — public and direct', () => {
  let backendServer: http.Server
  let previousFetch: typeof globalThis.fetch
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  let userCookieHeader: Record<string, string>

  let topicId: string
  let postId: string

  beforeAll(async () => {
    backendServer = createWebApiTestServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    vi.stubEnv('API_BASE_URL', backendBaseUrl)
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', backendBaseUrl)

    previousFetch = globalThis.fetch
    globalThis.fetch = createLoopbackClientFetch({
      baseUrl: backendBaseUrl,
      previousFetch,
      isActive: () => clientRuntimeActive,
      getCookie: () => clientCookieValue,
      buildHeaders: buildWebApiTestProxyHeaders,
      extraHeader: {
        name: 'X-CF-Worker-Secret',
        value: process.env.CF_WORKER_SECRET,
        mode: 'always',
      },
    })

    const user = await createTestUser()
    const admin = await createTestUser({ administrator: true })

    userCookieHeader = await createWebApiTestCookieHeader(user.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    const post = await createTestPost({ user })
    postId = post.id
  })

  afterAll(() =>
    closeWebApiClientRuntime({
      backendServer,
      previousFetch,
    }),
  )

  function withClientRuntime<T>(
    run: () => Promise<T>,
    cookieHeader?: Record<string, string>,
  ): Promise<T> {
    return withWebApiClientRuntime({
      cookieHeader,
      setActive: (active, cookie) => {
        clientRuntimeActive = active
        clientCookieValue = cookie
      },
      run,
    })
  }

  describe('web client API public routes', () => {
    it('fetchTopics returns a list of topics', async () => {
      const result = await withClientRuntime(() => clientRoutes.fetchTopics())
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('fetchTopic resolves the created topic', async () => {
      const result = await withClientRuntime(() => clientRoutes.fetchTopic(topicId))
      expect(result).not.toBeNull()
      expect(result?.id).toBe(topicId)
    })

    it('fetchPosts returns a list of posts', async () => {
      const result = await withClientRuntime(() => clientRoutes.fetchPosts())
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('fetchRssFeeds returns a list of rss feeds', async () => {
      const result = await withClientRuntime(() => clientRoutes.fetchRssFeeds(topicId))
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('fetchRssFeedItems returns a list of rss feed items', async () => {
      const result = await withClientRuntime(() => clientRoutes.fetchRssFeedItems())
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('GET /api/v1/posts/:id/images resolves', async () => {
      await expect(
        withClientRuntime(() => clientRoutes.clientApi.get(`/api/v1/posts/${postId}/images`)),
      ).resolves.not.toThrow()
    })
  })

  describe('web client API direct requests', () => {
    it('GET /api/v1/topics returns a list of topics', async () => {
      const result = await withClientRuntime(() =>
        clientRoutes.clientApi.get<{ results: unknown[] }>('/api/v1/topics'),
      )
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('GET /api/v1/topics/:id resolves the created topic', async () => {
      const result = await withClientRuntime(() =>
        clientRoutes.clientApi.get<{ topic: { id: string } }>(`/api/v1/topics/${topicId}`),
      )
      expect(result.topic.id).toBe(topicId)
    })

    it('GET /api/v1/posts returns a list of posts', async () => {
      const result = await withClientRuntime(() =>
        clientRoutes.clientApi.get<{ results: unknown[] }>('/api/v1/posts'),
      )
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('GET /api/v1/my/profile returns the authenticated user profile', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.clientApi.get<{ profile: unknown }>('/api/v1/my/profile'),
        userCookieHeader,
      )
      expect(result.profile).toBeDefined()
    })

    it('GET /api/v1/my/friend-recommendations resolves', async () => {
      await expect(
        withClientRuntime(
          () => clientRoutes.clientApi.get('/api/v1/my/friend-recommendations'),
          userCookieHeader,
        ),
      ).resolves.not.toThrow()
    })

    it('PUT /api/v1/bookmarks/:type/:id/:predicate creates a bookmark', async () => {
      const result = await withClientRuntime(
        () =>
          clientRoutes.clientApi.put<{ bookmark: unknown }>(
            `/api/v1/bookmarks/${encodeURIComponent('topic')}/${encodeURIComponent(topicId)}/${encodeURIComponent('follow')}`,
          ),
        userCookieHeader,
      )
      expect(result.bookmark).toBeDefined()
    })

    it('DELETE /api/v1/bookmarks/:type/:id/:predicate resolves after removing the bookmark', async () => {
      await expect(
        withClientRuntime(
          () =>
            clientRoutes.clientApi.delete(
              `/api/v1/bookmarks/${encodeURIComponent('topic')}/${encodeURIComponent(topicId)}/${encodeURIComponent('follow')}`,
            ),
          userCookieHeader,
        ),
      ).resolves.not.toThrow()
    })
  })

  describe('web API entity helpers', () => {
    it('client fetchTopic returns null for missing entities', async () => {
      await expect(
        withClientRuntime(() => clientRoutes.fetchTopic('missing-web-api-topic')),
      ).resolves.toBeNull()
    })
  })
})
