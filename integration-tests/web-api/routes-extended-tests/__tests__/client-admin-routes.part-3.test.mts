import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as supportRoutes from '@/lib/api/client/support'

import * as reportsRoutes from '@/lib/api/client/reports'

import * as financialRoutes from '@/lib/api/client/financial-profile'

import * as markdownRoutes from '@/lib/api/client/markdown'

import {
  createTestUser,
  createTestPost,
  insertTestSupportContact,
  insertTestSupportThread,
  insertTestSupportMessage,
} from '../../../../backend/test-helpers/index.mts'

import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../../routes.mts'

import type { CookieHeader } from '../../routes-extended.mts'

describe('routes-extended', () => {
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

  let postId: string

  let createdSupportThreadId: string

  let unrelatedSupportThreadId: string

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

      return previousFetch(`${backendBaseUrl}${input}`, { ...init, headers })
    }

    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()

    await createWebApiTestCookieHeader(admin.id)
    userCookieHeader = await createWebApiTestCookieHeader(user.id)

    // Post created by admin so user can report it without "Cannot report yourself"
    const post = await createTestPost({ user: admin })
    postId = post.id

    const suffix = crypto.randomUUID()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+support-test-${suffix}@voucha.ai`,
      name: `Support Test ${suffix}`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    unrelatedSupportThreadId = thread.id
    await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      draftedAt: new Date(),
    })
  }, 20_000)

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

  describe('support user client routes', () => {
    it('createMySupportThread creates thread', async () => {
      const suffix = crypto.randomUUID()
      const result = await withClientRuntime(
        () =>
          supportRoutes.createMySupportThread({
            subject: `Test Support Thread ${suffix}`,
            message: 'Hello, I need help.',
          }),
        userCookieHeader,
      )
      expect(result).toMatchObject({ thread: expect.objectContaining({ id: expect.any(String) }) })
      createdSupportThreadId = result.thread.id
    })

    it('getMySupportThreadsClient returns threads list', async () => {
      const result = await withClientRuntime(
        () => supportRoutes.getMySupportThreadsClient({ limit: 5 }),
        userCookieHeader,
      )
      // The thread created by the previous test belongs to this same user, so it must
      // show up here; an endpoint that always returns an empty/wrong list would still
      // pass a bare "results is an Array" check.
      expect(result.results.some(thread => thread.id === createdSupportThreadId)).toBe(true)
      // This inclusion check alone still passes if the endpoint stopped scoping by the
      // authenticated user's support contact and returned a global thread list, which would
      // expose other users' support data. The unrelated contact's thread seeded in beforeAll
      // must not leak into this user's result.
      expect(result.results.some(thread => thread.id === unrelatedSupportThreadId)).toBe(false)
    })
  })

  describe('reports client routes', () => {
    it('submitReport returns report', async () => {
      const result = await withClientRuntime(
        () =>
          reportsRoutes.submitReport({
            entityType: 'post',
            entityId: postId,
            reason: 'spam',
          }),
        userCookieHeader,
      )
      expect(result).toMatchObject({
        report: expect.objectContaining({ entity_type: 'post', entity_id: postId }),
      })
    })
  })

  describe('financial-profile client routes', () => {
    it('updateMyFinancialProfile returns updated profile', async () => {
      const result = await withClientRuntime(
        () =>
          financialRoutes.updateMyFinancialProfile({
            credit_score_range: '670-739',
            currency: 'usd',
            stated_income_range: {
              minimum: { amount: 7_500_000, currency: 'usd' },
              maximum: { amount: 10_000_000, currency: 'usd' },
            },
          }),
        userCookieHeader,
      )
      expect(result).toMatchObject({
        financial_profile: {
          currency: 'usd',
          credit_score_range: '670-739',
          stated_income_range: {
            minimum: { amount: 7_500_000, currency: 'usd' },
            maximum: { amount: 10_000_000, currency: 'usd' },
          },
        },
      })
    })
  })

  describe('markdown client routes', () => {
    it('previewMarkdown returns html', async () => {
      const result = await withClientRuntime(
        () => markdownRoutes.previewMarkdown('# Hello World\n\nThis is a test.'),
        userCookieHeader,
      )
      // A no-op renderer that just echoed the input (or always returned '') would still
      // satisfy a bare "html is a string" check; require actual comrak rendering.
      expect(result.html).toContain('<h1>')
      expect(result.html).toContain('Hello World')
      expect(result.html).toContain('<p>This is a test.</p>')
    })
  })
})
