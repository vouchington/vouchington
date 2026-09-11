import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as clientRoutes from '@/lib/api/client'

import * as serverRoutes from '@/lib/api/server'

import {
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestRssFeedDirect,
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

  let adminCookieHeader: CookieHeader

  let topicId: string

  let rssFeedId: string

  let rssFeedItemId: string

  let storyId: string

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

    await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)
    await createWebApiTestCookieHeader(verifiedUser.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    rssFeedId = await createTestRssFeedWithTiming(topicId)
    const item = await createTestRssFeedItemWithUrl(rssFeedId)
    rssFeedItemId = item.id

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

  describe('rss-feeds client routes', () => {
    it('createSource creates a source', async () => {
      const rssFeedUrlId = crypto.randomUUID()
      const result = await withClientRuntime(
        () =>
          clientRoutes.createSource({
            rss_feed_url: `https://feed-create-${rssFeedUrlId}.example.com/feed.xml`,
            follow: false,
          }),
        adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('updateRssFeed returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.updateRssFeed(rssFeedId, { title: 'Updated Title' }),
        adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('getRssFeedCrawls returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.getRssFeedCrawls(rssFeedId),
        adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('refreshRssFeed returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.refreshRssFeed(rssFeedId, {}),
        adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('deleteRssFeed removes the feed', async () => {
      const feed = await insertTestRssFeedDirect({})
      await withClientRuntime(() => clientRoutes.deleteRssFeed(feed.id), adminCookieHeader)

      await expect(
        serverRoutes.serverApi.get(`/api/v1/rss-feeds/${feed.id}`),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
