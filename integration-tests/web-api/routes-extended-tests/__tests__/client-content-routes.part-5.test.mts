import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import { psql as psqlQueue } from '../../../../backend/queues/psql/queues.mts'

import * as clientRoutes from '@/lib/api/client'

import {
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
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

  describe('psql client routes (admin only)', () => {
    it('fetchMigrations returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.fetchMigrations(),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        applied: expect.any(Array),
        pending: expect.any(Array),
        total: expect.any(Number),
      })
      // total is the on-disk migration file count; applied + pending must partition it exactly.
      // A broken endpoint returning {applied:[],pending:[],total:0} would satisfy both checks
      // above, even though this repository always has migration files on disk — require a
      // positive total and that this repo's first migration (guaranteed applied, since every
      // later migration depends on it) is actually present in the response.
      expect(result.total).toBe(result.applied.length + result.pending.length)
      expect(result.total).toBeGreaterThan(0)
      expect(result.applied).toContain('0000-00-00-core-functions-sites.sql')
    })

    it('fetchPartitions returns 200', async () => {
      const result = await withClientRuntime(
        () => clientRoutes.fetchPartitions(),
        adminCookieHeader,
      )
      expect(result).toMatchObject({ tables: expect.any(Array) })
      // {tables:[]} satisfies the shape check above even though the migrated test database
      // always has multiple partitioned tables — require a nonempty list that includes a
      // stable known parent table with an actual partition, so a regression that drops the
      // catalog rows is distinguishable from success.
      expect(result.tables.length).toBeGreaterThan(0)
      const sessionReferralAttributions = result.tables.find(
        table => table.name === 'session_referral_attributions',
      )
      expect(sessionReferralAttributions).toBeDefined()
      expect(sessionReferralAttributions!.partition_count).toBeGreaterThan(0)
    })

    it('enqueuePsqlJob runViews returns 200 and actually enqueues the job', async () => {
      // The route returns {success:true} unconditionally, whether or not
      // enqueueRunViews() actually ran — reading the queue directly is what proves a
      // job was really dispatched, not just that the route didn't throw. Diff against
      // a snapshot of existing job ids (rather than asserting on an empty-before state)
      // so this is unaffected by jobs left over from other test runs. A priority job with
      // no explicit delay lands directly in the waiting priority list, not the delayed
      // ZSet (that's reserved for jobs with a future runAt).
      const beforeIds = new Set(
        (await psqlQueue.getJobs('waiting', 0, -1, { excludeData: true })).map(job => job.id),
      )

      const result = await withClientRuntime(
        () => clientRoutes.enqueuePsqlJob('runViews'),
        adminCookieHeader,
      )
      expect(result).toMatchObject({ success: true })

      const afterJobs = await psqlQueue.getJobs('waiting', 0, -1, { excludeData: true })
      const newRunViewsJob = afterJobs.find(
        job => !beforeIds.has(job.id) && job.name === 'runViews',
      )
      expect(newRunViewsJob).toBeDefined()
    })
  })

  describe('valkey client routes (admin only)', () => {
    it('fetchCacheGroups returns 200', async () => {
      // {groups:[]} satisfies `expect.any(Array)` even though CACHE_GROUPS
      // (backend/services/valkey-admin/flush-targets.mts) always registers a fixed set of
      // groups — require the stable 'rss' group (with its declared prefixes) to actually be
      // present, so a regression that empties or breaks the registry is distinguishable from
      // success.
      const result = await withClientRuntime(
        () => clientRoutes.fetchCacheGroups(),
        adminCookieHeader,
      )
      const rssGroup = result.groups.find(group => group.name === 'rss')
      expect(rssGroup).toBeDefined()
      expect(rssGroup!.prefixes).toEqual(
        expect.arrayContaining(['rss_feeds', 'rss_feed_items', 'rss_feed_item_elections']),
      )
    })
  })

  describe('dynamic config client routes (admin only)', () => {
    it('fetchDynamicConfigNamespaces returns 200', async () => {
      // {namespaces:[]} satisfies `expect.any(Array)` even though the dynamic-config registry
      // (backend/services/dynamic-config-admin/registry-core-entries.mts) always registers
      // 'feature-flags', unconditionally viewable by an administrator — require it to actually
      // be present, so a regression that empties or breaks the registry is distinguishable
      // from success.
      const result = await withClientRuntime(
        () => clientRoutes.fetchDynamicConfigNamespaces(),
        adminCookieHeader,
      )
      const featureFlagsNamespace = result.namespaces.find(
        namespace => namespace.namespace === 'feature-flags',
      )
      expect(featureFlagsNamespace).toBeDefined()
      expect(featureFlagsNamespace!.can_view).toBe(true)
    })
  })
})
