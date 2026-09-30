import { afterAll, beforeAll } from 'vitest'
import http from 'node:http'

import type { PrivateUser } from '@voucha/types/entities/user'
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
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../web-api/routes.mts'

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

export type ClientContentFixtureContext = {
  harness: ClientContentRouteHarness
  user: PrivateUser
  admin: PrivateUser
  verifiedUser: PrivateUser
}

type FixtureHook = (ctx: ClientContentFixtureContext) => Promise<void>

export type ClientContentRouteHarnessOptions = {
  unset: (target: object, key: string) => void
  rssFeedItemOptions?: () => { createdAt?: Date }
  afterPrimaryItem?: FixtureHook
  afterStoryLinked?: FixtureHook
  afterPenalty?: FixtureHook
}

export function installClientContentRouteHarness(
  options: ClientContentRouteHarnessOptions,
): ClientContentRouteHarness {
  let backendServer: http.Server
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let previousFetch: typeof globalThis.fetch
  let hadWindow: boolean
  let previousWindow: unknown
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

    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    const verifiedUser = await createTestUser()
    await setUserVerificationFields(verifiedUser.id, { verificationStatus: 'verified' })
    harness.userId = user.id
    harness.userCookieHeader = await createWebApiTestCookieHeader(user.id)
    harness.adminCookieHeader = await createWebApiTestCookieHeader(admin.id)
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
  }, 30_000)

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
    options.unset(process.env, 'PLAYWRIGHT_TEST')
    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      options.unset(globalThis, 'window')
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
        options.unset(globalThis, 'window')
      }
    }
  }

  return harness
}
