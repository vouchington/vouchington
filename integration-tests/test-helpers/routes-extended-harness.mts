import { afterAll, beforeAll, vi } from 'vitest'
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
import {
  createWebApiTestServer,
  buildWebApiTestProxyHeaders,
  createWebApiTestCookieHeader,
  createWebApiMfaTestCookieHeader,
} from '../web-api/routes.mts'
import {
  closeWebApiClientRuntime,
  createLoopbackClientFetch,
  listenOnFetchSafeLoopback,
  withWebApiClientRuntime,
} from 'vouchington-tooling/integration-test-helpers'

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
  workerSecret: RoutesExtendedWorkerSecret
  seedCommunity?: (adminId: string) => Promise<void>
}

export function installRoutesExtendedHarness(
  options: InstallRoutesExtendedHarnessOptions,
): RoutesExtendedHarness {
  let backendServer: http.Server
  let previousFetch: typeof globalThis.fetch
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  const harness = {
    withClientRuntime: (run, cookieHeader) => withClientRuntime(run, cookieHeader),
  } as RoutesExtendedHarness

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
        mode: options.workerSecret,
      },
    })

    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    harness.user = user
    harness.admin = admin
    harness.userCookieHeader = await createWebApiTestCookieHeader(user.id)
    harness.adminCookieHeader = await createWebApiMfaTestCookieHeader(admin.id)

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
  })

  afterAll(() =>
    closeWebApiClientRuntime({
      backendServer,
      previousFetch,
    }),
  )

  function withClientRuntime<T>(run: () => Promise<T>, cookieHeader?: CookieHeader): Promise<T> {
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
