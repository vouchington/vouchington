import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../../backend/entrypoints/api/index.mts'
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
} from '../../../backend/test-helpers/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'
import type { CookieHeader } from '../routes-extended.mts'

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

  let userUsername: string

  let referralProgramId: string

  let topicRecPostId: string

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
    await createWebApiTestCookieHeader(admin.id)

    await createTestTopic({ user: admin })

    await createTestPost({ user })

    await insertTestCommunity({ createdById: admin.id })

    const referralProgram = await createReferralProgramFixture({ createdById: admin.id })
    referralProgramId = referralProgram.referralProgramId

    const topicRecommendationId = randomUUID()
    const topicRec = (await withClientRuntime(
      () =>
        clientRoutes.createTopicRecommendation({
          markdown: 'A great topic recommendation for testing',
          topic_title: `Extended Test Topic ${topicRecommendationId}`,
          topic_slug: `ext-test-topic-rec-${topicRecommendationId}`,
        }),
      userCookieHeader,
    )) as { post: { id: string } }
    topicRecPostId = topicRec.post.id
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

  describe('users client routes', () => {
    it('fetchFollowerUsers returns an empty result for a user with no followers', async () => {
      const result = await withClientRuntime(() => clientRoutes.fetchFollowerUsers(userUsername))
      expect(result.results).toEqual([])
    })

    it('creates and fetches a curated user tag relation', async () => {
      const target = await createTestUser({ username: safeUsername('ext-user-tag') })
      const catalog = await serverRoutes.serverApi.get<{
        user_tags: Array<{ id: string; slug: string; label: string }>
      }>('/api/v1/topics/user-tags', { headers: userCookieHeader })
      const botTag = catalog.user_tags.find(tag => tag.slug === 'bot')
      if (!botTag) throw new Error('Missing Bot user tag fixture')

      await withClientRuntime(
        () => clientRoutes.createEntityRelation('user', target.id, 'category', 'topic', botTag.id),
        userCookieHeader,
      )
      const relations = await withClientRuntime(
        () => clientRoutes.fetchEntityRelations('user', target.id, 'category', 'topic'),
        userCookieHeader,
      )
      expect(Object.values(relations.entity_relations)).toEqual(
        expect.arrayContaining([expect.objectContaining({ object_id: botTag.id })]),
      )
    })
    it('submitUserVouchVote resolves for an authenticated vote', async () => {
      const target = await createTestUser({ username: safeUsername('ext-user-vouch-vote') })

      // submitUserVouchVote() returns void; assert the call resolves rather than throwing an
      // ApiError, since there is no headers-accepting read route available here to verify the
      // vote's effect directly.
      await expect(
        withClientRuntime(
          () => clientRoutes.submitUserVouchVote(target.id, 'like'),
          userCookieHeader,
        ),
      ).resolves.toBeUndefined()
    })
  })

  describe('topic-recommendations server routes', () => {
    it('getTopicRecommendations includes the created topic recommendation', async () => {
      const result = await serverRoutes.getTopicRecommendations({ headers: userCookieHeader })
      expect(result.results.some(entry => entry.id === topicRecPostId)).toBe(true)
      expect(result.posts[topicRecPostId]?.post_type).toBe('topic_recommendation')
    })

    it('getTopicRecommendation resolves the created topic recommendation', async () => {
      const result = await serverRoutes.getTopicRecommendation(topicRecPostId, {
        headers: userCookieHeader,
      })
      expect(result).not.toBeNull()
      expect(result?.post.id).toBe(topicRecPostId)
    })
  })

  describe('topic-recommendations client routes', () => {
    it('fetchTopicRecommendations includes the created topic recommendation', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.fetchTopicRecommendations(),
        userCookieHeader,
      )
      expect(result.results.some(entry => entry.id === topicRecPostId)).toBe(true)
    })

    it('createTopicRecommendation returns the persisted post', async () => {
      const topicRecommendationId = randomUUID()
      const markdown = `Another topic recommendation for extended tests ${topicRecommendationId}`

      const result = await withClientRuntime(
        () =>
          clientRoutes.createTopicRecommendation({
            markdown,
            topic_title: `Extended Topic Rec ${topicRecommendationId}`,
            topic_slug: `ext-topic-rec-${topicRecommendationId}`,
          }),
        userCookieHeader,
      )
      expect(result.post.markdown).toBe(markdown)
    })
  })

  describe('referral-links server routes', () => {
    it('getPrioritizedReferralLinks returns an empty result for a program with no links', async () => {
      const result = await serverRoutes.getPrioritizedReferralLinks(referralProgramId)
      expect(result.links).toEqual([])
    })

    it('getMyReferralLinks returns an empty result for a user with no referral links', async () => {
      // getMyReferralLinks() has no headers parameter and catches all errors silently;
      // call the raw API directly to verify authentication actually succeeds
      const result = await serverRoutes.serverApi.get<{ results: unknown[] }>(
        '/api/v1/referral-links',
        {
          searchParams: { referral_program_id: referralProgramId },
          headers: userCookieHeader,
        },
      )
      expect(result.results).toEqual([])
    })

    it('GET /api/v1/referral-links (no program filter) returns an empty result', async () => {
      // getAllMyReferralLinks() has no headers parameter and catches all errors silently;
      // call the raw API directly to verify the route works when authenticated
      const result = await serverRoutes.serverApi.get<{ results: unknown[] }>(
        '/api/v1/referral-links',
        { headers: userCookieHeader },
      )
      expect(result.results).toEqual([])
    })
  })
})
