import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../backend/entrypoints/api/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from './routes.mts'
import * as clientRoutes from '@/lib/api/client'
import * as serverRoutes from '@/lib/api/server'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestUrlHostname,
  insertTestUrl,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '../../backend/test-helpers/index.mts'
import type { CookieHeader } from './routes-extended.mts'

describe('community-list-items', () => {
  let backendServer: http.Server
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let previousFetch: typeof globalThis.fetch
  let hadWindow: boolean
  let previousWindow: unknown
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  let adminCookieHeader: CookieHeader

  let communitySlug: string
  let communityId: string
  let topicId: string
  let rssFeedId: string
  let rssFeedItemId: string
  let postId: string
  let hostnameId: string
  let urlId: string
  let adminUser: NonNullable<Awaited<ReturnType<typeof createTestUser>>>

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

    const admin = await createTestUser({ administrator: true })
    adminUser = admin

    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    const post = await createTestPost({ user: admin })
    postId = post.id

    rssFeedId = await createTestRssFeedWithTiming(topic.id)
    const rssFeedItem = await createTestRssFeedItemWithUrl(rssFeedId)
    rssFeedItemId = rssFeedItem.id

    const hostname = `cli-test-${randomUUID()}.example.com`
    hostnameId = await insertTestUrlHostname({ hostname, blocked: false, crawlable: true })
    urlId = await insertTestUrl({ url: `https://${hostname}/path`, hostnameId })

    const community = await insertTestCommunity({ createdById: admin.id })
    communitySlug = community.slug
    communityId = community.id
    await insertTestCommunityMember({
      communityId,
      userId: admin.id,
      role: 'owner',
    })

    // Seed one list item of each type so GET endpoints return data
    await Promise.all([
      insertTestCommunityListItem({
        communityId,
        itemType: 'topic',
        entityId: topicId,
        addedById: admin.id,
      }),
      insertTestCommunityListItem({
        communityId,
        itemType: 'rss_feed',
        entityId: rssFeedId,
        addedById: admin.id,
      }),
      insertTestCommunityListItem({
        communityId,
        itemType: 'post',
        entityId: postId,
        addedById: admin.id,
      }),
      insertTestCommunityListItem({
        communityId,
        itemType: 'url_hostname',
        entityId: hostnameId,
        addedById: admin.id,
      }),
      insertTestCommunityListItem({
        communityId,
        itemType: 'url',
        entityId: urlId,
        addedById: admin.id,
      }),
    ])
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

  describe('community list items server routes', () => {
    it('getCommunityListTopics returns paginated items', async () => {
      const result = await serverRoutes.getCommunityListTopics(communitySlug)
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.page_info).toBeDefined()
      expect(result.community_list_items).toBeDefined()
      expect(result.topics).toBeDefined()
    })

    it('getCommunityListRssFeeds returns 200', async () => {
      const result = await serverRoutes.getCommunityListRssFeeds(communitySlug)
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.community_list_items).toBeDefined()
      expect(result.rss_feeds).toBeDefined()
    })

    it('getCommunityNews returns 200', async () => {
      // This community is newly created for this test, but the shared, dirty integration
      // database has plenty of rss_feed_items overall — a route that dropped community
      // scoping and returned the globally most-recent items would still satisfy `length >= 1`.
      // Assert the seeded item's id is actually present to catch that.
      const result = await serverRoutes.getCommunityNews(communitySlug)
      expect(result.results.map(item => item.id)).toContain(rssFeedItemId)
      expect(result.rss_feed_items[rssFeedItemId]).toBeDefined()
    })

    it('getCommunityListPosts returns 200', async () => {
      const result = await serverRoutes.getCommunityListPosts(communitySlug)
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.community_list_items).toBeDefined()
      expect(result.posts).toBeDefined()
    })

    it('getCommunityListDomains returns 200', async () => {
      const result = await serverRoutes.getCommunityListDomains(communitySlug)
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.community_list_items).toBeDefined()
      expect(result.url_hostnames).toBeDefined()
    })

    it('getCommunityListUrls returns 200', async () => {
      const result = await serverRoutes.getCommunityListUrls(communitySlug)
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.community_list_items).toBeDefined()
      expect(result.urls).toBeDefined()
    })

    it('getCommunityListItemCounts returns counts per type', async () => {
      const result = await serverRoutes.getCommunityListItemCounts(communitySlug)
      expect(result.topic).toBeGreaterThanOrEqual(1)
      expect(result.rss_feed).toBeGreaterThanOrEqual(1)
      expect(result.post).toBeGreaterThanOrEqual(1)
      expect(result.url_hostname).toBeGreaterThanOrEqual(1)
      expect(result.url).toBeGreaterThanOrEqual(1)
    })
  })

  describe('community list items client routes', () => {
    it('addCommunityListTopic + removeCommunityListItem round-trip', async () => {
      const roundTripTopic = await createTestTopic({ user: adminUser })

      await withClientRuntime(
        () => clientRoutes.addCommunityListTopic(communitySlug, roundTripTopic.id),
        adminCookieHeader,
      )

      const afterAdd = await serverRoutes.getCommunityListTopics(communitySlug)
      const addedItem = Object.values(afterAdd.community_list_items).find(
        item => item.entity_id === roundTripTopic.id,
      )
      expect(addedItem).toBeDefined()

      await withClientRuntime(
        () => clientRoutes.removeCommunityListItem(communitySlug, 'topic', addedItem!.id),
        adminCookieHeader,
      )

      const afterRemove = await serverRoutes.getCommunityListTopics(communitySlug)
      const removedItem = Object.values(afterRemove.community_list_items).find(
        item => item.entity_id === roundTripTopic.id,
      )
      expect(removedItem).toBeUndefined()
    })
  })

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
})
