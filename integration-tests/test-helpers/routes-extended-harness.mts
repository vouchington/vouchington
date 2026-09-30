import { afterAll, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../backend/entrypoints/api/index.mts'
import * as clientRoutes from '@/lib/api/client'
import {
  createReferralProgramFixture,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestCommunity,
} from '../../backend/test-helpers/index.mts'
import type { CookieHeader } from '../web-api/routes-extended.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../web-api/routes.mts'

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000

export type RoutesExtendedWorkerSecret = 'always' | 'with-cookie'

export type RoutesExtendedHarness = {
  user: Awaited<ReturnType<typeof createTestUserWithAge>>
  admin: Awaited<ReturnType<typeof createTestUser>>
  userCookieHeader: CookieHeader
  adminCookieHeader: CookieHeader
  topic: Awaited<ReturnType<typeof createTestTopic>>
  compareTopicA: Awaited<ReturnType<typeof createTestTopic>>
  compareTopicB: Awaited<ReturnType<typeof createTestTopic>>
  post: Awaited<ReturnType<typeof createTestPost>>
  referralProgram: Awaited<ReturnType<typeof createReferralProgramFixture>>
  withClientRuntime: <T>(run: () => Promise<T>, cookieHeader?: CookieHeader) => Promise<T>
}

export type InstallRoutesExtendedHarnessOptions = {
  unset: (target: object, key: string) => void
  workerSecret: RoutesExtendedWorkerSecret
  seedCommunity?: (adminId: string) => Promise<void>
}

export function installRoutesExtendedHarness(
  options: InstallRoutesExtendedHarnessOptions,
): RoutesExtendedHarness {
  let backendServer: http.Server
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let previousFetch: typeof globalThis.fetch
  let hadWindow: boolean
  let previousWindow: unknown
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  const harness = {
    withClientRuntime: (run, cookieHeader) => withClientRuntime(run, cookieHeader),
  } as RoutesExtendedHarness

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
      const secret = process.env.CF_WORKER_SECRET
      if (options.workerSecret === 'always' && secret) {
        headers.set('X-CF-Worker-Secret', secret)
      }
      if (clientCookieValue) {
        headers.set('Cookie', clientCookieValue)
        if (options.workerSecret === 'with-cookie' && secret) {
          headers.set('X-CF-Worker-Secret', secret)
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

    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    harness.user = user
    harness.admin = admin
    harness.userCookieHeader = await createWebApiTestCookieHeader(user.id)
    harness.adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    harness.topic = await createTestTopic({ user: admin })

    const compareTopicsId = randomUUID()
    harness.compareTopicA = await createTestTopic({
      user: admin,
      slug: `ext-compare-a-${compareTopicsId}`,
      name: `Extended Compare Topic A ${compareTopicsId}`,
    })
    harness.compareTopicB = await createTestTopic({
      user: admin,
      slug: `ext-compare-b-${compareTopicsId}`,
      name: `Extended Compare Topic B ${compareTopicsId}`,
    })

    harness.post = await createTestPost({ user })
    if (options.seedCommunity) {
      await options.seedCommunity(admin.id)
    } else {
      await insertTestCommunity({ createdById: admin.id })
    }
    harness.referralProgram = await createReferralProgramFixture({ createdById: admin.id })

    const topicRecommendationId = randomUUID()
    await withClientRuntime(
      () =>
        clientRoutes.createTopicRecommendation({
          markdown: 'A great topic recommendation for testing',
          topic_title: `Extended Test Topic ${topicRecommendationId}`,
          topic_slug: `ext-test-topic-rec-${topicRecommendationId}`,
        }),
      harness.userCookieHeader,
    )
  }, 20_000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })
    if (previousApiBaseUrl === undefined) {
      options.unset(process.env, 'API_BASE_URL')
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      options.unset(process.env, 'NEXT_PUBLIC_API_BASE_URL')
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }

    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      options.unset(globalThis, 'window')
    }
  }, 15_000)

  async function withClientRuntime<T>(
    run: () => Promise<T>,
    cookieHeader?: CookieHeader,
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
        options.unset(globalThis, 'window')
      }
    }
  }

  return harness
}
