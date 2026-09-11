import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as clientRoutes from '@/lib/api/client'

import {
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestStory,
  insertTestVoteWeightPenalty,
  setTestItemStoryId,
  setUserVerificationFields,
} from '../../../../backend/test-helpers/index.mts'

import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../../routes.mts'

import type { CookieHeader } from '../../routes-extended.mts'

describe('client-content-routes', () => {
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

  let topicId: string

  let rssFeedId: string

  let rssFeedItemId: string

  let rssFeedItemSearchToken: string

  let nonMatchingRssFeedItemId: string

  let storyId: string

  let userId: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl
    process.env.PLAYWRIGHT_TEST = 'true'

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
      return previousFetch(`${backendBaseUrl}${input}`, { ...init, headers })
    }

    const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000
    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    const verifiedUser = await createTestUser()
    await setUserVerificationFields(verifiedUser.id, { verificationStatus: 'verified' })
    userId = user.id

    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)
    await createWebApiTestCookieHeader(verifiedUser.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    rssFeedId = await createTestRssFeedWithTiming(topicId)
    // published_at is a generated column defaulting to the item's insertion instant. The
    // 'no options' test below asserts this item appears in the globally recency-ordered,
    // default-limit-10 feed with no scoping filter — on a dirty, parallel database, other
    // integration-test files concurrently inserting real-time-stamped rss_feed_items could
    // otherwise push this fixture out of the top 10 between beforeAll and the assertion.
    // Pin it to a bounded near-future window (not a permanent far-future date) so it sorts
    // ahead of same-instant inserts from concurrent test files for the life of this test run,
    // then decays into ordinary history a few minutes later instead of permanently dominating
    // recency-ordered queries against the shared, never-cleaned database.
    const RSS_FEED_ITEM_FIXTURE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
    const item = await createTestRssFeedItemWithUrl(rssFeedId, {
      createdAt: new Date(Date.now() + RSS_FEED_ITEM_FIXTURE_WINDOW_MS),
    })
    rssFeedItemId = item.id
    // createTestRssFeedItemWithUrl titles items "Test Item <random>"; the random
    // suffix is unique to this fixture and indexed into rss_feed_items.search_vector,
    // so it is a token a `q` search can match on without also matching other items.
    rssFeedItemSearchToken = item.title.split(' ').at(-1)!

    // A second item with an unrelated title/random suffix under the same feed, pinned to the
    // same bounded future window (a moment earlier) so it is also among the most-recent items
    // in this feed's global recency ordering. If `q` were dropped or ignored, an unfiltered
    // top-5 would legitimately include this item too, so asserting its exclusion below is what
    // actually detects a broken search parameter rather than the item merely aging out of the
    // page on a dirty database.
    const nonMatchingItem = await createTestRssFeedItemWithUrl(rssFeedId, {
      createdAt: new Date(Date.now() + RSS_FEED_ITEM_FIXTURE_WINDOW_MS - 1000),
    })
    nonMatchingRssFeedItemId = nonMatchingItem.id

    const story = await insertTestStory({ title: 'Test Story for API' })
    storyId = story.id
    await setTestItemStoryId(rssFeedItemId, storyId)

    await insertTestVoteWeightPenalty(user.id, admin.id)
  }, 30_000)

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
    delete process.env.PLAYWRIGHT_TEST
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

  describe('rss-feed-items client routes', () => {
    it('fetchRssFeedItems returns 200 with no options', async () => {
      // No filters are applied when called with no options: the query is the most-recent
      // rss_feed_items globally (default limit 10), so the item seeded in beforeAll — pinned
      // to a bounded near-future published_at — is present for the life of this test run
      // regardless of what other test files concurrently insert. Any nonempty response with
      // page_info would otherwise satisfy this on a dirty, parallel database even if the
      // client hit the wrong endpoint — assert the seeded item's id is actually present, and
      // that its entity map entry was hydrated, to verify the contract.
      const result = await withClientRuntime(
        () => clientRoutes.fetchRssFeedItems(),
        userCookieHeader,
      )
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.page_info).toBeDefined()
      const resultIds = result.results.map(item => item.id)
      expect(resultIds).toContain(rssFeedItemId)
      expect(result.rss_feed_items[rssFeedItemId]).toBeDefined()
    })

    it('fetchRssFeedItems returns 200 with search query', async () => {
      // If `q` were dropped or ignored, the unfiltered feed would still return an
      // array with page_info (it also contains nonMatchingRssFeedItemId), so assert
      // on which items come back rather than only the response shape.
      const result = await withClientRuntime(
        () => clientRoutes.fetchRssFeedItems({ q: rssFeedItemSearchToken, limit: 5 }),
        userCookieHeader,
      )
      const resultIds = result.results.map(item => item.id)
      expect(resultIds).toContain(rssFeedItemId)
      expect(resultIds).not.toContain(nonMatchingRssFeedItemId)
    })

    it('shareRssFeedItemWithFollowers returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.shareRssFeedItemWithFollowers(rssFeedItemId),
        adminCookieHeader,
      )
      expect(result).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    })

    it('sendRssFeedItemToFollowers with all_followers returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.sendRssFeedItemToFollowers(rssFeedItemId, { audience: 'all_followers' }),
        adminCookieHeader,
      )
      expect(result).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    })

    it('sendRssFeedItemToFollowers with selected_followers reaches the endpoint', async () => {
      await expect(
        withClientRuntime(
          () =>
            clientRoutes.sendRssFeedItemToFollowers(rssFeedItemId, {
              audience: 'selected_followers',
              recipient_user_ids: [userId],
            }),
          adminCookieHeader,
        ),
      ).rejects.toMatchObject({ name: 'ApiError' })
    })
  })
})
