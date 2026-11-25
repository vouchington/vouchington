import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  closeWebApiClientRuntime,
  createLoopbackClientFetch,
  listenOnFetchSafeLoopback,
  withWebApiClientRuntime,
} from 'vouchington-tooling/integration-test-helpers'

import { randomUUID } from 'node:crypto'

import http from 'node:http'

import serverApp from '../../../backend/entrypoints/api/index.mts'

import * as clientRoutes from '@/lib/api/client'

import {
  createTestAgent,
  createTestConversation,
  createTestConversationMessage,
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestCrawl,
  insertTestCrawler,
  insertTestPost,
  insertTestUrl,
  insertTestUrlHostname,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '../../../backend/test-helpers/index.mts'

import { createHousehold } from '../../../backend/services/individuals-households/index.mts'

import {
  createWebApiTestServer,
  buildWebApiTestProxyHeaders,
  createWebApiTestCookieHeader,
  createWebApiMfaTestCookieHeader,
} from '../routes.mts'

describe('routes — user and admin', () => {
  let backendServer: http.Server

  let previousFetch: typeof globalThis.fetch

  let backendBaseUrl: string

  let clientRuntimeActive = false

  let clientCookieValue: string | undefined

  let adminCookieHeader: Record<string, string>

  let topicId: string

  let reviewQueuePostId: string

  let conversationId: string

  let hostnameId: string

  let urlId: string

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

    await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiMfaTestCookieHeader(admin.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    await createTestPost({ user })
    reviewQueuePostId = await insertTestPost({
      title: 'Web API review queue post',
      slug: `web-api-review-queue-ua-${randomUUID()}`,
      createdById: user.id,
      markdown: 'Review queue fixture for web API helper coverage.',
      clearanceStatus: 'rejected',
    })

    const rssFeedId = await createTestRssFeedWithTiming(topic.id)
    await createTestRssFeedItemWithUrl(rssFeedId)

    await createHousehold(user)
    const agent = await createTestAgent({ activated: true })

    const conversation = await createTestConversation({
      createdById: user.id,
      title: 'Web API Test Conversation',
    })
    conversationId = conversation.id

    await createTestConversationMessage({
      conversationId,
      createdById: agent.system_user_id,
      content: { role: 'assistant', content: 'Hello from the test agent' },
    })
    const hostname = `web-api-ua-${randomUUID()}.example.com`
    hostnameId = await insertTestUrlHostname({
      hostname,
      is_blocked: false,
      is_crawlable: true,
    })
    urlId = await insertTestUrl({
      url: `https://${hostname}/path`,
      hostnameId,
    })
    await insertTestCrawler({
      hostnameId,
      description: 'Web API test crawler',
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Web API test crawl markdown',
    })
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

  describe('web client API admin routes', () => {
    it('fetchTopicAliases returns a list of aliases', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.fetchTopicAliases(topicId),
        adminCookieHeader,
      )
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('enqueueUrlCrawl enqueues a crawl', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.enqueueUrlCrawl(urlId),
        adminCookieHeader,
      )
      expect(result.success).toBe(true)
    })

    it('fetchCacheGroups returns the cache groups', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.fetchCacheGroups(),
        adminCookieHeader,
      )
      expect(Array.isArray(result.groups)).toBe(true)
    })

    it('rebuildBloomFilter rebuilds the requested filter', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.rebuildBloomFilter('url-blocklist'),
        adminCookieHeader,
      )
      expect(result.success).toBe(true)
      expect(result.filter).toBe('url-blocklist')
    })

    it('updateAdminReviewQueuePost approves the review queue post', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.updateAdminReviewQueuePost(reviewQueuePostId, 'approved'),
        adminCookieHeader,
      )
      expect(result.post.id).toBe(reviewQueuePostId)
      expect(result.post.clearance_status).toBe('approved')
    })
  })
})
