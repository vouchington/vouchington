import { afterAll, beforeAll } from 'vitest'
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
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../web-api/routes.mts'

export type UserAdminRouteHarness = {
  userCookieHeader: Record<string, string>
  topicId: string
  withClientRuntime: <T>(run: () => Promise<T>, cookieHeader?: Record<string, string>) => Promise<T>
}

export function installUserAdminRouteHarness(
  unset: (target: object, key: string) => void,
): UserAdminRouteHarness {
  let backendServer: http.Server
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let previousFetch: typeof globalThis.fetch
  let hadWindow: boolean
  let previousWindow: unknown
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  const harness: UserAdminRouteHarness = {
    userCookieHeader: {},
    topicId: '',
    withClientRuntime: (run, cookieHeader) => withClientRuntime(run, cookieHeader),
  }

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
      content: { role: 'assistant', text: 'Hello from the test agent' },
    })
    const hostname = `web-api-ua-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({
      hostname,
      blocked: false,
      crawlable: true,
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
  }, 15_000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })
    if (previousApiBaseUrl === undefined) {
      unset(process.env, 'API_BASE_URL')
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      unset(process.env, 'NEXT_PUBLIC_API_BASE_URL')
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }

    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      unset(globalThis, 'window')
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
        unset(globalThis, 'window')
      }
    }
  }

  return harness
}
