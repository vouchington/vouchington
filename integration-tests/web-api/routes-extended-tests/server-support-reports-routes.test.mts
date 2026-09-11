import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import * as serverRoutes from '@/lib/api/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
  insertTestSupportMessage,
} from '../../../backend/test-helpers/index.mts'
import { resolveSupportThread } from '../../../backend/services/customer-support/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'
import type { CookieHeader } from '../routes-extended.mts'

describe('routes-extended', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let previousFetch: typeof globalThis.fetch

  let hadWindow: boolean

  let previousWindow: unknown

  let backendBaseUrl: string

  let adminCookieHeader: CookieHeader

  let userCookieHeader: CookieHeader

  let runId: string

  let supportContactId: string

  let supportThreadId: string

  let supportThreadIdSecondary: string

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
    globalThis.fetch = previousFetch

    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()

    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)
    userCookieHeader = await createWebApiTestCookieHeader(user.id)

    runId = randomUUID().slice(0, 8)
    // getMySupportThreads resolves "my" contact by the user's own email address (not by
    // support_contacts.user_id), so the seeded contact must reuse it.
    const contact = await insertTestSupportContact({
      emailAddress: user.email_address!,
      name: `Test Support Contact ${runId}`,
      userId: user.id,
    })
    supportContactId = contact.id

    // Two threads under this contact: enough to prove limit truncates and q scopes results.
    const thread = await insertTestSupportThread({
      supportContactId: contact.id,
      subject: `Test Support Thread Alpha ${runId}`,
    })
    supportThreadId = thread.id

    const threadSecondary = await insertTestSupportThread({
      supportContactId: contact.id,
      subject: `Test Support Thread Beta ${runId}`,
    })
    supportThreadIdSecondary = threadSecondary.id

    // Resolve the secondary thread so status filtering has a non-open thread to exclude.
    await resolveSupportThread(supportThreadIdSecondary, admin.id)

    // Two messages on the primary thread prove getAdminSupportThreadMessages' limit truncation.
    await insertTestSupportMessage({ supportThreadId: supportThreadId, direction: 'inbound' })
    await insertTestSupportMessage({ supportThreadId: supportThreadId, direction: 'outbound' })
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

  describe('support server routes — admin threads', () => {
    it('getAdminSupportThreads returns page_info shape', async () => {
      const result = await serverRoutes.getAdminSupportThreads({ headers: adminCookieHeader })
      expect(result).toMatchObject({
        page_info: expect.objectContaining({ has_next_page: expect.any(Boolean) }),
      })
    })

    it('getAdminSupportThreads respects status filter', async () => {
      // Scope with `q: runId`: an unscoped default-limit-25 page could otherwise drop our
      // fixture off the first page even when status filtering works. `q: runId` leaves
      // `status` as the only predicate distinguishing our two threads (supportThreadIdSecondary
      // was resolved above), so the exact result set below catches a no-op status filter.
      const open = await serverRoutes.getAdminSupportThreads({
        status: 'open',
        q: runId,
        headers: adminCookieHeader,
      })
      expect(open.results.map(t => t.id)).toEqual([supportThreadId])

      const resolved = await serverRoutes.getAdminSupportThreads({
        status: 'resolved',
        q: runId,
        headers: adminCookieHeader,
      })
      expect(resolved.results.map(t => t.id)).toEqual([supportThreadIdSecondary])
    })

    it('getAdminSupportThreads respects q + limit params', async () => {
      // `q` is unique to this test run's fixtures, so it scopes results to exactly
      // our two threads; `limit` then proves truncation within that scoped set.
      const limited = await serverRoutes.getAdminSupportThreads({
        q: runId,
        limit: 1,
        headers: adminCookieHeader,
      })
      expect(limited.results).toHaveLength(1)
      expect(limited.results[0]!.subject).toContain(runId)

      const unlimited = await serverRoutes.getAdminSupportThreads({
        q: runId,
        limit: 10,
        headers: adminCookieHeader,
      })
      expect(unlimited.results.map(t => t.id).sort()).toEqual(
        [supportThreadId, supportThreadIdSecondary].sort(),
      )
    })

    it('getAdminSupportThread returns thread for existing id', async () => {
      const result = await serverRoutes.getAdminSupportThread(supportThreadId, {
        headers: adminCookieHeader,
      })
      expect(result).toMatchObject({ thread: expect.objectContaining({ id: supportThreadId }) })
    })

    it('getAdminSupportThread returns null for missing id', async () => {
      const result = await serverRoutes.getAdminSupportThread(randomUUID(), {
        headers: adminCookieHeader,
      })
      expect(result).toBeNull()
    })

    it('getAdminSupportThreadMessages returns results for existing thread', async () => {
      const result = await serverRoutes.getAdminSupportThreadMessages(supportThreadId, {
        headers: adminCookieHeader,
      })
      expect(result!.results).toHaveLength(2)
    })

    it('getAdminSupportThreadMessages returns null for missing thread', async () => {
      const result = await serverRoutes.getAdminSupportThreadMessages(randomUUID(), {
        headers: adminCookieHeader,
      })
      expect(result).toBeNull()
    })

    it('getAdminSupportThreadMessages respects limit param', async () => {
      const limited = await serverRoutes.getAdminSupportThreadMessages(supportThreadId, {
        limit: 1,
        headers: adminCookieHeader,
      })
      expect(limited!.results).toHaveLength(1)

      const unlimited = await serverRoutes.getAdminSupportThreadMessages(supportThreadId, {
        limit: 10,
        headers: adminCookieHeader,
      })
      expect(unlimited!.results).toHaveLength(2)
    })
  })

  describe('support server routes — admin contacts', () => {
    it('getAdminSupportContacts returns page_info shape', async () => {
      const result = await serverRoutes.getAdminSupportContacts({ headers: adminCookieHeader })
      expect(result).toMatchObject({
        page_info: expect.objectContaining({ has_next_page: expect.any(Boolean) }),
      })
    })

    it('getAdminSupportContacts respects q + limit params', async () => {
      // Name/email both embed `runId`, so q scopes to exactly our one seeded contact.
      const result = await serverRoutes.getAdminSupportContacts({
        q: runId,
        limit: 5,
        headers: adminCookieHeader,
      })
      expect(result.results).toHaveLength(1)
      expect(result.results[0]!.id).toBe(supportContactId)
    })

    it('getAdminSupportContact returns contact for existing id', async () => {
      const result = await serverRoutes.getAdminSupportContact(supportContactId, {
        headers: adminCookieHeader,
      })
      expect(result).toMatchObject({ contact: expect.objectContaining({ id: supportContactId }) })
    })

    it('getAdminSupportContact returns null for missing id', async () => {
      const result = await serverRoutes.getAdminSupportContact(randomUUID(), {
        headers: adminCookieHeader,
      })
      expect(result).toBeNull()
    })

    it('getAdminSupportContact respects limit param', async () => {
      const limited = await serverRoutes.getAdminSupportContact(supportContactId, {
        limit: 1,
        headers: adminCookieHeader,
      })
      expect(limited!.threads).toHaveLength(1)
      expect(limited!.thread_page_info.has_next_page).toBe(true)

      const unlimited = await serverRoutes.getAdminSupportContact(supportContactId, {
        limit: 10,
        headers: adminCookieHeader,
      })
      expect(unlimited!.threads).toHaveLength(2)
      expect(unlimited!.thread_page_info.has_next_page).toBe(false)
    })
  })

  describe('support server routes — user my threads', () => {
    it('getMySupportThreads returns page_info shape for authenticated user', async () => {
      const result = await serverRoutes.getMySupportThreads({ headers: userCookieHeader })
      expect(result).toMatchObject({
        page_info: expect.objectContaining({ has_next_page: expect.any(Boolean) }),
      })
    })

    it('getMySupportThreads respects limit param', async () => {
      const limited = await serverRoutes.getMySupportThreads({
        limit: 1,
        headers: userCookieHeader,
      })
      expect(limited.results).toHaveLength(1)

      const unlimited = await serverRoutes.getMySupportThreads({
        limit: 10,
        headers: userCookieHeader,
      })
      expect(unlimited.results.map(t => t.id).sort()).toEqual(
        [supportThreadId, supportThreadIdSecondary].sort(),
      )
    })

    it('getMySupportThread returns null for missing thread', async () => {
      const result = await serverRoutes.getMySupportThread(randomUUID(), {
        headers: userCookieHeader,
      })
      expect(result).toBeNull()
    })
  })

  describe('reports server routes', () => {
    it('getPendingModerationReports returns page_info shape for admin', async () => {
      const result = await serverRoutes.getPendingModerationReports({ headers: adminCookieHeader })
      expect(result).toMatchObject({
        page_info: expect.objectContaining({ has_next_page: expect.any(Boolean) }),
      })
    })
  })
})
