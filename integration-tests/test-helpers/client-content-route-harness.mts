import { afterAll, beforeAll, vi } from 'vitest'
import http from 'node:http'

import serverApp from '../../backend/entrypoints/api/index.mts'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestStory,
  insertTestVoteWeightPenalty,
  setTestItemStoryId,
  setUserVerificationFields,
} from '../../backend/test-helpers/index.mts'
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

export type ClientContentRouteHarness = {
  userId: string
  userCookieHeader: Record<string, string>
  adminCookieHeader: Record<string, string>
  verifiedUserCookieHeader: Record<string, string>
  topicId: string
  rssFeedId: string
  rssFeedItemId: string
  rssFeedItemTitle: string
  storyId: string
  penaltyId: string
  withClientRuntime: <T>(run: () => Promise<T>, cookieHeader?: Record<string, string>) => Promise<T>
}

type FixtureUser = Awaited<ReturnType<typeof createTestUser>>

export type ClientContentFixtureContext = {
  harness: ClientContentRouteHarness
  user: FixtureUser
  admin: FixtureUser
  verifiedUser: FixtureUser
}

type FixtureHook = (ctx: ClientContentFixtureContext) => Promise<void>

export type ClientContentRouteHarnessOptions = {
  rssFeedItemOptions?: () => { createdAt?: Date }
  afterPrimaryItem?: FixtureHook
  afterStoryLinked?: FixtureHook
  afterPenalty?: FixtureHook
}

export function installClientContentRouteHarness(
  options: ClientContentRouteHarnessOptions = {},
): ClientContentRouteHarness {
  let backendServer: http.Server
  let previousFetch: typeof globalThis.fetch
  let backendBaseUrl: string
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  const harness: ClientContentRouteHarness = {
    userId: '',
    userCookieHeader: {},
    adminCookieHeader: {},
    verifiedUserCookieHeader: {},
    topicId: '',
    rssFeedId: '',
    rssFeedItemId: '',
    rssFeedItemTitle: '',
    storyId: '',
    penaltyId: '',
    withClientRuntime: (run, cookieHeader) => withClientRuntime(run, cookieHeader),
  }

  beforeAll(async () => {
    backendServer = createWebApiTestServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    vi.stubEnv('API_BASE_URL', backendBaseUrl)
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', backendBaseUrl)
    vi.stubEnv('PLAYWRIGHT_TEST', 'true')

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

    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    const verifiedUser = await createTestUser()
    await setUserVerificationFields(verifiedUser.id, { verificationStatus: 'verified' })
    harness.userId = user.id
    harness.userCookieHeader = await createWebApiTestCookieHeader(user.id)
    harness.adminCookieHeader = await createWebApiMfaTestCookieHeader(admin.id)
    harness.verifiedUserCookieHeader = await createWebApiTestCookieHeader(verifiedUser.id)

    const topic = await createTestTopic({ user: admin })
    harness.topicId = topic.id
    harness.rssFeedId = await createTestRssFeedWithTiming(harness.topicId)
    const item = await createTestRssFeedItemWithUrl(
      harness.rssFeedId,
      options.rssFeedItemOptions?.(),
    )
    harness.rssFeedItemId = item.id
    harness.rssFeedItemTitle = item.title
    const ctx: ClientContentFixtureContext = { harness, user, admin, verifiedUser }
    await options.afterPrimaryItem?.(ctx)

    const story = await insertTestStory({ title: 'Test Story for API' })
    harness.storyId = story.id
    await setTestItemStoryId(harness.rssFeedItemId, harness.storyId)
    await options.afterStoryLinked?.(ctx)

    harness.penaltyId = await insertTestVoteWeightPenalty(user.id, admin.id)
    await options.afterPenalty?.(ctx)
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
