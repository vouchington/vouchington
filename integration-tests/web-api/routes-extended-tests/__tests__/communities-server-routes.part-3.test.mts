import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { randomUUID } from 'node:crypto'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as clientRoutes from '@/lib/api/client'

import * as serverRoutes from '@/lib/api/server'

import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestCommunity,
  createReferralProgramFixture,
  safeUsername,
} from '../../../../backend/test-helpers/index.mts'

import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../../routes.mts'

import type { CookieHeader } from '../../routes-extended.mts'

describe('routes-extended', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let previousFetch: typeof globalThis.fetch

  let hadWindow: boolean

  let previousWindow: unknown

  let backendBaseUrl: string

  let clientRuntimeActive = false

  let clientCookieValue: string | undefined

  let userCookieHeader: CookieHeader

  let adminCookieHeader: CookieHeader

  let userUsername: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    previousFetch = globalThis.fetch
    hadWindow = Object.hasOwn(globalThis, 'window')
    previousWindow = (globalThis as { window?: unknown }).window
    globalThis.fetch = (input, init) => {
      if (!clientRuntimeActive || typeof input !== 'string' || !input.startsWith('/')) {
        return previousFetch(input, init)
      }

      const headers = new Headers(init?.headers)
      if (process.env.CF_WORKER_SECRET) {
        headers.set('X-CF-Worker-Secret', process.env.CF_WORKER_SECRET)
      }
      if (clientCookieValue) {
        headers.set('Cookie', clientCookieValue)
        if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
          headers.set('Origin', backendBaseUrl)
        }
      }

      return previousFetch(`${backendBaseUrl}${input}`, {
        ...init,
        headers,
      })
    }

    const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000
    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    userUsername = user.username!

    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    await createTestTopic({ user: admin })

    const compareTopicsId = randomUUID()
    await createTestTopic({
      user: admin,
      slug: `ext-compare-a-${compareTopicsId}`,
      name: `Extended Compare Topic A ${compareTopicsId}`,
    })
    await createTestTopic({
      user: admin,
      slug: `ext-compare-b-${compareTopicsId}`,
      name: `Extended Compare Topic B ${compareTopicsId}`,
    })

    await createTestPost({ user })

    await insertTestCommunity({ createdById: admin.id })

    await createReferralProgramFixture({ createdById: admin.id })

    const topicRecommendationId = randomUUID()
    await withClientRuntime(
      () =>
        clientRoutes.createTopicRecommendation({
          markdown: 'A great topic recommendation for testing',
          topic_title: `Extended Test Topic ${topicRecommendationId}`,
          topic_slug: `ext-test-topic-rec-${topicRecommendationId}`,
        }),
      userCookieHeader,
    )
  }, 20_000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })
    if (previousApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }

    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }, 15_000)

  async function withClientRuntime<T>(
    run: () => Promise<T>,
    cookieHeader?: Record<string, string>,
  ): Promise<T> {
    clientRuntimeActive = true
    clientCookieValue = cookieHeader?.Cookie
    ;(globalThis as { window?: unknown }).window = {}

    try {
      return await run()
    } finally {
      clientRuntimeActive = false
      clientCookieValue = undefined

      if (hadWindow) {
        ;(globalThis as { window?: unknown }).window = previousWindow
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  }

  describe('users server routes', () => {
    it('getUserTopicsCollection returns an empty result for a user following no topics', async () => {
      const result = await serverRoutes.getUserTopicsCollection(userUsername, 'following')
      expect(result).not.toBeNull()
      expect(result?.results).toEqual([])
    })

    it('getUserUsersCollection returns an empty result for a user following no users', async () => {
      const result = await serverRoutes.getUserUsersCollection(userUsername, 'following')
      expect(result).not.toBeNull()
      expect(result?.results).toEqual([])
    })

    it('getUserRssFeedItemsCollection returns null when unauthenticated', async () => {
      // Unlike the "following" topics/users collections above, saved rss feed items are
      // owner-only: resolveTargetUser's privateCollection check (ctx.assert(currentUser, 401,
      // ...)) fires before any 403/404 check, so an unauthenticated request gets a 401, which
      // returnNullForMissingEntity's nullStatusCodes converts to null. Assert the raw status
      // directly so a regression that instead 404s (broken route, missing target) can't produce
      // the same null through a different failure mode and slip past this test.
      await expect(
        serverRoutes.serverApi.get(
          `/api/v1/users/${encodeURIComponent(userUsername)}/rss-feed-items/saved`,
        ),
      ).rejects.toMatchObject({ status: 401 })

      const result = await serverRoutes.getUserRssFeedItemsCollection(userUsername, 'saved')
      expect(result).toBeNull()
    })

    it('getUserVouchContext returns null when unauthenticated', async () => {
      const target = await createTestUser({ username: safeUsername('ext-vouch-ctx-anon') })

      // requireAuth throws 401 for anonymous requests before any target-lookup path runs, which
      // returnNullForMissingEntity's nullStatusCodes converts to null. Assert the raw status
      // directly so a regression that instead 404s can't produce the same null and slip past
      // this test.
      await expect(
        serverRoutes.serverApi.get(`/api/v1/users/${encodeURIComponent(target.id)}/vouch-context`),
      ).rejects.toMatchObject({ status: 401 })

      const result = await serverRoutes.getUserVouchContext(target.id)
      expect(result).toBeNull()
    })

    it('GET /api/v1/users/:id/vouch-context returns the expected shape for authed viewers', async () => {
      const target = await createTestUser({ username: safeUsername('ext-vouch-ctx-auth') })

      const raw = await serverRoutes.serverApi.get<{
        positive_by_following: { total: number; users: unknown[] }
        negative_by_following: { total: number; users: unknown[] }
      }>(`/api/v1/users/${encodeURIComponent(target.id)}/vouch-context`, {
        headers: userCookieHeader,
      })
      expect(raw.positive_by_following).toMatchObject({ total: expect.any(Number) })
      expect(raw.negative_by_following).toMatchObject({ total: expect.any(Number) })
    })
    it('GET /api/v1/topics/user-tags returns the curated moderation catalog', async () => {
      const raw = await serverRoutes.serverApi.get<{
        user_tags: Array<{ id: string; slug: string; label: string }>
      }>('/api/v1/topics/user-tags', { headers: adminCookieHeader })

      expect(raw.user_tags).toEqual([
        expect.objectContaining({ slug: 'bot', label: 'Bot' }),
        expect.objectContaining({ slug: 'spammer', label: 'Spammer' }),
      ])
    })
  })
})
