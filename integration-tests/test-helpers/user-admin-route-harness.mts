import { afterAll, beforeAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'

import serverApp from '../../backend/entrypoints/api/index.mts'
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
} from '../../backend/test-helpers/index.mts'
import { createHousehold } from '../../backend/services/individuals-households/index.mts'
import {
  createWebApiTestServer,
  buildWebApiTestProxyHeaders,
  createWebApiTestCookieHeader,
} from '../web-api/routes.mts'
import {
  closeWebApiClientRuntime,
  createLoopbackClientFetch,
  listenOnFetchSafeLoopback,
  withWebApiClientRuntime,
} from 'vouchington-tooling/integration-test-helpers'

export type UserAdminRouteHarness = {
  userCookieHeader: Record<string, string>
  topicId: string
  withClientRuntime: <T>(run: () => Promise<T>, cookieHeader?: Record<string, string>) => Promise<T>
}

export function installUserAdminRouteHarness(): UserAdminRouteHarness {
  let backendServer: http.Server
  let previousFetch: typeof globalThis.fetch
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  const harness: UserAdminRouteHarness = {
    userCookieHeader: {},
    topicId: '',
    withClientRuntime: (run, cookieHeader) => withClientRuntime(run, cookieHeader),
  }

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

    harness.userCookieHeader = await createWebApiTestCookieHeader(user.id)
    await createWebApiTestCookieHeader(admin.id)

    const topic = await createTestTopic({ user: admin })
    harness.topicId = topic.id

    await createTestPost({ user })
    await insertTestPost({
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

    await createTestConversationMessage({
      conversationId: conversation.id,
      createdById: agent.system_user_id,
      content: { role: 'assistant', content: 'Hello from the test agent' },
    })
    const hostname = `web-api-ua-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({
      hostname,
      is_blocked: false,
      is_crawlable: true,
    })
    const urlId = await insertTestUrl({
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

  return harness
}
