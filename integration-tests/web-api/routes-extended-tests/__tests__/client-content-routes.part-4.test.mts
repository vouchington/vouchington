import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as clientRoutes from '@/lib/api/client'

import {
  updateMyIdentityVerificationDisplayPreferences,
  getMyIdentityVerificationSessionUrl,
} from '@/lib/api/client/identity-verification'

import type { VoteIntegrityPenalty } from '@/types/vote-integrity'

import {
  createTestPost,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestStory,
  insertTestVoteIntegrityFlag,
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

  let verifiedUserCookieHeader: CookieHeader

  let topicId: string

  let rssFeedId: string

  let rssFeedItemId: string

  let storyId: string

  let penaltyId: string

  let pendingFlagId: string

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

    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)
    verifiedUserCookieHeader = await createWebApiTestCookieHeader(verifiedUser.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    rssFeedId = await createTestRssFeedWithTiming(topicId)
    const item = await createTestRssFeedItemWithUrl(rssFeedId)
    rssFeedItemId = item.id

    const story = await insertTestStory({ title: 'Test Story for API' })
    storyId = story.id
    await setTestItemStoryId(rssFeedItemId, storyId)

    penaltyId = await insertTestVoteWeightPenalty(user.id, admin.id)

    const flagPost = await createTestPost({ user: admin })
    pendingFlagId = await insertTestVoteIntegrityFlag({ postId: flagPost.id })
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

  describe('vote-integrity client routes (admin only)', () => {
    it('getVoteIntegrityFlagsClient returns 200 with no params', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>(),
        adminCookieHeader,
      )
      expect(result.results.some(flag => flag.id === pendingFlagId)).toBe(true)
    })

    it('getVoteIntegrityFlagsClient returns 200 with status param', async () => {
      const result = await withClientRuntime(
        () =>
          clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>({
            status: 'pending',
          }),
        adminCookieHeader,
      )
      expect(result.results.some(flag => flag.id === pendingFlagId)).toBe(true)
    })

    it('getVoteIntegrityFlagsClient returns 200 with resolved status', async () => {
      await withClientRuntime(
        () => clientRoutes.resolveVoteIntegrityFlag(pendingFlagId, 'dismissed'),
        adminCookieHeader,
      )

      const resolved = await withClientRuntime(
        () =>
          clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>({
            status: 'resolved',
          }),
        adminCookieHeader,
      )
      expect(resolved.results.some(flag => flag.id === pendingFlagId)).toBe(true)

      const stillPending = await withClientRuntime(
        () =>
          clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>({
            status: 'pending',
          }),
        adminCookieHeader,
      )
      expect(stillPending.results.some(flag => flag.id === pendingFlagId)).toBe(false)
    })

    it('revokeVoteWeightPenalty returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.revokeVoteWeightPenalty<{ penalty: VoteIntegrityPenalty }>(penaltyId),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        penalty: expect.objectContaining({ id: penaltyId, revoked_at: expect.any(String) }),
      })
    })
  })

  describe('identity-verification client routes', () => {
    it('getMyIdentityVerificationSessionUrl reaches the endpoint (requires pending session)', async () => {
      // Endpoint requires verification_status === 'identity_pending' with a real Stripe session.
      // Confirm the function reaches the API route by matching the domain error.
      await expect(
        withClientRuntime(() => getMyIdentityVerificationSessionUrl(), userCookieHeader),
      ).rejects.toMatchObject({ name: 'ApiError' })
    })

    it('updateMyIdentityVerificationDisplayPreferences returns 200 for verified user', async () => {
      // verifiedUser was set to verified before the server started, so no stale cache.
      const result = await withClientRuntime(
        () =>
          updateMyIdentityVerificationDisplayPreferences({
            verified_badge_visible: false,
          }),
        verifiedUserCookieHeader,
      )
      expect(result).toMatchObject({ verified_badge_visible: false })
    })
  })
})
