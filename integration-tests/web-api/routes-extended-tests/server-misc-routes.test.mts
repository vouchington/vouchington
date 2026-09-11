import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import * as serverRoutes from '@/lib/api/server'
import { getMigrationStatus, getPartitionStatus } from '@/lib/api/server/psql'
import { getMyConversations, getMyConversationMessages } from '@/lib/api/server/conversations'
import { encodeCursor } from '@modules/pagination'
import {
  createTestUser,
  createTestLandingPage,
  createTestConversation,
  createTestMembership,
  safeUsername,
} from '../../../backend/test-helpers/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'
import type { CookieHeader } from '../routes-extended.mts'

describe('server-misc-routes', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let previousFetch: typeof globalThis.fetch

  let hadWindow: boolean

  let previousWindow: unknown

  let backendBaseUrl: string

  let userCookieHeader: CookieHeader

  let adminCookieHeader: CookieHeader

  let landingPageId: string

  let conversationId: string

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

    const user = await createTestUser({ username: safeUsername('misc-routes-user') })
    const admin = await createTestUser({ administrator: true })
    await createTestMembership({ user_id: user.id, plan: 'plus' })

    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    const lp = await createTestLandingPage(user.id, `Test LP ${randomUUID()}`)
    landingPageId = lp.landingPageId

    const conv = await createTestConversation({
      createdById: user.id,
      title: `Test Conv ${randomUUID()}`,
    })
    conversationId = conv.id
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

  describe('feature-flags server routes', () => {
    it('getFeatureFlags returns flags with user headers', async () => {
      const response = await serverRoutes.getFeatureFlags({ headers: userCookieHeader })

      expect(response.flags).toEqual(expect.any(Object))
      expect(response.overrides).toEqual({})
    })

    it('getFeatureFlags returns flags with admin headers', async () => {
      const response = await serverRoutes.getFeatureFlags({ headers: adminCookieHeader })

      expect(response.flags).toEqual(expect.any(Object))
      expect(response.overrides).toEqual({})
    })
  })

  describe('platform-stats server routes', () => {
    it('getPlatformStats returns 200', async () => {
      const response = await serverRoutes.getPlatformStats()

      expect(response.topic_count).toEqual(expect.any(Number))
      expect(response.post_count).toEqual(expect.any(Number))
    })
  })

  describe('landing-page-analytics server routes', () => {
    // getMyLandingPageAnalytics has no headers option; test the underlying endpoint directly
    // to exercise both the success path and returnNullForMissingEntity null path.
    it('landing-page analytics endpoint returns analytics for existing page', async () => {
      const response = await serverRoutes.serverApi.get<{ analytics: unknown }>(
        `/api/v1/my/landing-pages/${encodeURIComponent(landingPageId)}/analytics`,
        { headers: userCookieHeader },
      )

      expect(response.analytics).toEqual(
        expect.objectContaining({ conversion_funnel: expect.any(Object) }),
      )
    })

    it('landing-page analytics endpoint returns null for missing page (returnNullForMissingEntity null path)', async () => {
      const { returnNullForMissingEntity } =
        await import('@/lib/api/return-null-for-missing-entity')
      const result = await returnNullForMissingEntity(
        serverRoutes.serverApi.get(
          `/api/v1/my/landing-pages/${encodeURIComponent(randomUUID())}/analytics`,
          { headers: userCookieHeader },
        ),
      )
      expect(result).toBeNull()
    })
  })

  describe('trending-topics server routes', () => {
    it('getTrendingTopics returns 200 without options', async () => {
      const response = await serverRoutes.getTrendingTopics()

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getTrendingTopics returns 200 with searchParams', async () => {
      const response = await serverRoutes.getTrendingTopics({ searchParams: { limit: 5 } })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getTrendingTopics returns 200 with headers', async () => {
      const response = await serverRoutes.getTrendingTopics({ headers: userCookieHeader })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })
  })

  describe('vote-integrity server routes', () => {
    type VoteIntegrityListResponse = { results: unknown[]; page_info: unknown }

    it('getVoteIntegrityFlags returns 200 with admin auth', async () => {
      const response = await serverRoutes.getVoteIntegrityFlags<VoteIntegrityListResponse>({
        headers: adminCookieHeader,
      })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getVoteIntegrityFlags returns 200 with searchParams', async () => {
      const response = await serverRoutes.getVoteIntegrityFlags<VoteIntegrityListResponse>({
        headers: adminCookieHeader,
        searchParams: { limit: 10 },
      })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getVoteIntegrityPenalties returns 200 with admin auth', async () => {
      const response = await serverRoutes.getVoteIntegrityPenalties<VoteIntegrityListResponse>({
        headers: adminCookieHeader,
      })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getVoteIntegrityPenalties returns 200 with searchParams', async () => {
      const response = await serverRoutes.getVoteIntegrityPenalties<VoteIntegrityListResponse>({
        headers: adminCookieHeader,
        searchParams: { limit: 10 },
      })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })
  })

  describe('psql server routes', () => {
    it('getMigrationStatus returns 200 with admin auth', async () => {
      const response = await getMigrationStatus({ headers: adminCookieHeader })

      expect(response.applied).toEqual(expect.any(Array))
      expect(response.total).toEqual(expect.any(Number))
    })

    it('getPartitionStatus returns 200 with admin auth', async () => {
      const response = await getPartitionStatus({ headers: adminCookieHeader })

      expect(response.tables).toEqual(expect.any(Array))
    })
  })
  describe('conversations server routes', () => {
    it('getMyConversations returns 200 without options', async () => {
      const response = await getMyConversations({ headers: userCookieHeader })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getMyConversations returns 200 with after param', async () => {
      const response = await getMyConversations({
        headers: userCookieHeader,
        after: encodeCursor({ id: conversationId }),
      })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getMyConversations rejects a raw UUID after param', async () => {
      await expect(
        getMyConversations({ headers: userCookieHeader, after: randomUUID() }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('getMyConversations returns 200 with limit param', async () => {
      const response = await getMyConversations({ headers: userCookieHeader, limit: 5 })

      expect(response.results).toEqual(expect.any(Array))
      expect(response.page_info).toEqual(expect.any(Object))
    })

    it('getMyConversationMessages returns messages for existing conversation', async () => {
      const response = await getMyConversationMessages(conversationId, {
        headers: userCookieHeader,
      })

      expect(response).not.toBeNull()
      expect(response?.results).toEqual(expect.any(Array))
      expect(response?.page_info).toEqual(expect.any(Object))
    })

    it('getMyConversationMessages returns null for missing conversation (returnNullForMissingEntity branch)', async () => {
      const result = await getMyConversationMessages(randomUUID(), { headers: userCookieHeader })
      expect(result).toBeNull()
    })
  })
})
