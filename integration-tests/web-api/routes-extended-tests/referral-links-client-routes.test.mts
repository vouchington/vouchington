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

  let topicId: string

  let postId: string

  let referralProgramId: string

  let referralProgramHostname: string

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
      if (clientCookieValue) {
        headers.set('Cookie', clientCookieValue)
        if (process.env.CF_WORKER_SECRET) {
          headers.set('X-CF-Worker-Secret', process.env.CF_WORKER_SECRET)
        }
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
    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    await createWebApiTestCookieHeader(admin.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

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

    const post = await createTestPost({ user })
    postId = post.id

    await insertTestCommunity({ createdById: admin.id })

    const referralProgram = await createReferralProgramFixture({ createdById: admin.id })
    referralProgramId = referralProgram.referralProgramId
    referralProgramHostname = referralProgram.hostname

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

  describe('referral-links client routes', () => {
    it('activateReferralLink returns 200', async () => {
      // Create a link first to ensure one exists for this test
      await withClientRuntime(
        () =>
          clientRoutes.createReferralLink({
            referral_program_id: referralProgramId,
            url: `https://${referralProgramHostname}/ref/activate-test`,
            label: null,
          }),
        userCookieHeader,
      )
      const res = await serverRoutes.serverApi.get<{
        results: Array<{ id: string }>
      }>('/api/v1/referral-links', {
        searchParams: { referral_program_id: referralProgramId },
        headers: userCookieHeader,
      })
      const linkId = res.results[0]?.id
      expect(linkId).toBeDefined()
      await withClientRuntime(() => clientRoutes.activateReferralLink(linkId!), userCookieHeader)
    })

    it('deactivateReferralLink returns 200', async () => {
      // Create a link specifically for this test so it is self-contained
      await withClientRuntime(
        () =>
          clientRoutes.createReferralLink({
            referral_program_id: referralProgramId,
            url: `https://${referralProgramHostname}/ref/deactivate-test`,
            label: null,
          }),
        userCookieHeader,
      )
      const res = await serverRoutes.serverApi.get<{
        results: Array<{ id: string }>
      }>('/api/v1/referral-links', {
        searchParams: { referral_program_id: referralProgramId },
        headers: userCookieHeader,
      })
      const linkId = res.results[0]?.id
      expect(linkId).toBeDefined()
      await withClientRuntime(() => clientRoutes.deactivateReferralLink(linkId!), userCookieHeader)
    })

    it('getMyReferralLinksClient returns 200', async () => {
      const res = await withClientRuntime(
        () => clientRoutes.getMyReferralLinksClient(),
        userCookieHeader,
      )
      expect(res).toBeDefined()
      expect(res.results).toBeInstanceOf(Array)
    })
  })

  describe('my referral-clicks server routes', () => {
    it('getMyReferralClicks returns 200', async () => {
      const res = await serverRoutes.getMyReferralClicks({ headers: userCookieHeader })
      expect(res).toBeDefined()
      expect(res.results).toBeInstanceOf(Array)
    })
  })

  describe('my referral-clicks client routes', () => {
    it('getMyReferralClicksClient returns 200', async () => {
      const res = await withClientRuntime(
        () => clientRoutes.getMyReferralClicksClient(),
        userCookieHeader,
      )
      expect(res).toBeDefined()
      expect(res.results).toBeInstanceOf(Array)
    })
  })

  describe('elections client routes', () => {
    it('submitPostVote resolves', async () => {
      await expect(
        withClientRuntime(() => clientRoutes.submitPostVote(postId, 'like'), userCookieHeader),
      ).resolves.toBeUndefined()
    })

    it('submitTopicVote resolves', async () => {
      await expect(
        withClientRuntime(() => clientRoutes.submitTopicVote(topicId, 'like'), userCookieHeader),
      ).resolves.toBeUndefined()
    })
  })

  describe('api-keys client routes', () => {
    it('createApiKey and revokeApiKey return 200', async () => {
      const created = (await withClientRuntime(
        () => clientRoutes.createApiKey('extended-test-key', 'rss', ['rss:read']),
        userCookieHeader,
      )) as { api_key: { id: string }; raw_key: string }
      expect(created.api_key?.id).toBeDefined()
      expect(created.raw_key).toBeDefined()
      await withClientRuntime(() => clientRoutes.revokeApiKey(created.api_key.id), userCookieHeader)
    })
  })
})
