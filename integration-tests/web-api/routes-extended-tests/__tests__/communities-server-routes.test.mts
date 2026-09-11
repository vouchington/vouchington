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
  insertTestCommunityMember,
  createReferralProgramFixture,
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

  let communitySlug: string

  let communitySearchToken: string

  let communityId: string

  let adminId: string

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
    adminId = admin.id

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

    communitySearchToken = randomUUID().replace(/-/g, '')
    const community = await insertTestCommunity({
      createdById: admin.id,
      name: `Extended Routes Community ${communitySearchToken}`,
      slug: `ext-routes-community-${communitySearchToken}`,
    })
    communitySlug = community.slug
    communityId = community.id
    await insertTestCommunityMember({
      communityId: community.id,
      userId: admin.id,
      role: 'owner',
    })

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

  describe('communities server routes', () => {
    it('getCommunities includes the created community', async () => {
      // Scope the search to a pure-alphanumeric token unique to this fixture:
      // getCommunities() defaults to page one (20 communities, sorted by name), so on a DB
      // that has accumulated more than 20 randomly named `Test Community ...` fixtures, an
      // unscoped query would flake on unrelated test-run history rather than a real bug.
      // Searching by the full hyphenated slug instead of this token would reintroduce the
      // same flake risk: websearch_to_tsquery splits hyphenated compound words into
      // sub-lexemes (see the "hyphen issues" note in
      // backend/services/communities/__tests__/search.sort.test.mts), so a query for
      // `ext-routes-community-<token>` can match on just the shared `community` part and pull
      // in every other `Test Community`/`ext-routes-community` fixture again.
      const result = await serverRoutes.getCommunities({
        searchParams: { q: communitySearchToken },
      })
      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.id).toBe(communityId)
      expect(result.communities[communityId]?.slug).toBe(communitySlug)
    })

    it('getCommunity resolves the created community', async () => {
      const result = await serverRoutes.getCommunity(communitySlug)
      expect(result).not.toBeNull()
      expect(result?.community.id).toBe(communityId)
    })

    it('getCommunityMembers returns the owner membership', async () => {
      const result = await serverRoutes.getCommunityMembers(communitySlug, {
        headers: adminCookieHeader,
      })
      expect(result.results).toHaveLength(1)
      expect(result.community_members[result.results[0]!.id]?.user_id).toBe(adminId)
    })

    it('getCommunityPosts returns an empty result for a community with no posts', async () => {
      const result = await serverRoutes.getCommunityPosts(communitySlug)
      expect(result.results).toEqual([])
    })

    it('getCommunityPendingPosts returns an empty result for a community with no pending posts', async () => {
      const result = await serverRoutes.getCommunityPendingPosts(communitySlug, {
        headers: adminCookieHeader,
      })
      expect(result.results).toEqual([])
    })

    it('getCommunityApplicationQuestions returns an empty result for a community with no questions', async () => {
      const result = await serverRoutes.getCommunityApplicationQuestions(communitySlug)
      expect(result.questions).toEqual([])
    })

    it('getCommunityApplications returns an empty result for a community with no applications', async () => {
      const result = await serverRoutes.getCommunityApplications(communitySlug, {
        headers: adminCookieHeader,
      })
      expect(result.results).toEqual([])
    })

    it('getCommunityInvites returns an empty result for a community with no invites', async () => {
      const result = await serverRoutes.getCommunityInvites(communitySlug, {
        headers: adminCookieHeader,
      })
      expect(result.results).toEqual([])
    })
  })
})
