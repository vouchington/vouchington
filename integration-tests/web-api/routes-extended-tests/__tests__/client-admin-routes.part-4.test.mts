import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as conversationsRoutes from '@/lib/api/client/conversations'

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
    await createTestPost({ user: admin })

    const suffix = crypto.randomUUID()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+support-test-${suffix}@voucha.ai`,
      name: `Support Test ${suffix}`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
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

  describe('conversations client routes', () => {
    let conversationId: string

    it('createConversation returns conversation', async () => {
      const result = await withClientRuntime(
        () => conversationsRoutes.createConversation({ title: 'Test Conversation' }),
        userCookieHeader,
      )
      expect(result).toMatchObject({
        conversation: expect.objectContaining({ id: expect.any(String) }),
      })
      conversationId = result.conversation.id
    })

    it('getMyConversationsClient returns conversations', async () => {
      const result = await withClientRuntime(
        () => conversationsRoutes.getMyConversationsClient({ limit: 5 }),
        userCookieHeader,
      )
      expect(result).toMatchObject({ results: expect.any(Array) })
    })

    it('getConversationMessages returns messages', async () => {
      const result = await withClientRuntime(
        () => conversationsRoutes.getConversationMessages(conversationId),
        userCookieHeader,
      )
      expect(result).toMatchObject({ results: expect.any(Array) })
    })

    it('updateConversationTitle updates title', async () => {
      const result = await withClientRuntime(
        () => conversationsRoutes.updateConversationTitle(conversationId, 'Updated Title'),
        userCookieHeader,
      )
      expect(result).toMatchObject({
        conversation: expect.objectContaining({ id: conversationId }),
      })
    })

    it('deleteConversation removes the conversation', async () => {
      await withClientRuntime(
        () => conversationsRoutes.deleteConversation(conversationId),
        userCookieHeader,
      )

      await expect(
        withClientRuntime(
          () => conversationsRoutes.getConversationMessages(conversationId),
          userCookieHeader,
        ),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
