import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import * as crmRoutes from '@/lib/api/client/crm'
import { getAdminCrmContact } from '@/lib/api/server/crm'

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

  let adminCookieHeader: CookieHeader

  let userId: string

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
    userId = user.id

    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)
    await createWebApiTestCookieHeader(user.id)

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

  describe('crm client routes', () => {
    let crmContactId: string
    let crmNoteId: string

    it('createCrmContact returns contact', async () => {
      const suffix = crypto.randomUUID()
      const name = `Test CRM Contact ${suffix}`
      const email = `tests+crm-test-${suffix}@voucha.ai`
      const result = await withClientRuntime(
        () => crmRoutes.createCrmContact({ name, email }),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        contact: expect.objectContaining({ id: expect.any(String), name, email }),
      })
      crmContactId = result.contact.id
    })

    it('updateCrmContact returns updated contact', async () => {
      const result = await withClientRuntime(
        () => crmRoutes.updateCrmContact(crmContactId, { notes: 'Updated note' }),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        contact: expect.objectContaining({ id: crmContactId, notes: 'Updated note' }),
      })
    })

    it('createCrmNote returns note', async () => {
      const result = await withClientRuntime(
        () => crmRoutes.createCrmNote(crmContactId, 'Test note body'),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        note: expect.objectContaining({ id: expect.any(String), body: 'Test note body' }),
      })
      crmNoteId = result.note.id
    })

    it('linkCrmContactToUser returns contact with user link', async () => {
      const result = await withClientRuntime(
        () => crmRoutes.linkCrmContactToUser(crmContactId, userId),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        contact: expect.objectContaining({ id: crmContactId, user_id: userId }),
      })
    })

    it('unlinkCrmContact returns contact without user link', async () => {
      const result = await withClientRuntime(
        () => crmRoutes.unlinkCrmContact(crmContactId),
        adminCookieHeader,
      )
      expect(result).toMatchObject({
        contact: expect.objectContaining({ id: crmContactId, user_id: null }),
      })
    })

    it('deleteCrmNote succeeds', async () => {
      const result = await withClientRuntime(
        () => crmRoutes.deleteCrmNote(crmContactId, crmNoteId),
        adminCookieHeader,
      )
      expect(result).toBeUndefined()

      await expect(
        withClientRuntime(
          () => crmRoutes.deleteCrmNote(crmContactId, crmNoteId),
          adminCookieHeader,
        ),
      ).rejects.toMatchObject({ name: 'ApiError', status: 404 })
    })

    it('deleteCrmContact succeeds', async () => {
      expect(
        await withClientRuntime(() => crmRoutes.deleteCrmContact(crmContactId), adminCookieHeader),
      ).toBeUndefined()

      const archived = await getAdminCrmContact(crmContactId, { headers: adminCookieHeader })
      expect(archived).not.toBeNull()
      expect(archived!.contact.archived_at).toEqual(expect.any(String))
    })
  })
})
