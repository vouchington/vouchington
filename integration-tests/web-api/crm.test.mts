import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import serverApp from '../../backend/entrypoints/api/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from './routes.mts'
import { getAdminCrmContacts, getAdminCrmContact } from '@/lib/api/server/crm'
import { createTestUser } from '../../backend/test-helpers/index.mts'
import {
  createTestCrmContact,
  insertTestCrmContactSocialAccount,
} from '../../backend/test-helpers/entities/crm-contacts.mts'

describe('crm', () => {
  let backendServer: http.Server
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let backendBaseUrl: string

  let adminCookieHeader: Record<string, string>
  let contactId: string
  let contactEmail: string
  let awaitingResponseContact: { id: string }
  let newStatusContact: { id: string }
  let statusFilterToken: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    const admin = await createTestUser({ administrator: true })
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    const contact = await createTestCrmContact(admin)
    contactId = contact.id
    contactEmail = contact.email
    await insertTestCrmContactSocialAccount(contactId)

    // Both status fixtures share this token in their name so a `q` search narrows to just the
    // two of them regardless of status — status is the only filter that can distinguish between
    // them, which is what the 'filters by status' test below relies on.
    statusFilterToken = crypto.randomUUID()
    awaitingResponseContact = await createTestCrmContact(admin, {
      name: `Status Filter Test Awaiting ${statusFilterToken}`,
      contactedAt: new Date(),
    })
    newStatusContact = await createTestCrmContact(admin, {
      name: `Status Filter Test New ${statusFilterToken}`,
    })
  }, 15_000)

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
  })

  describe('getAdminCrmContacts', () => {
    it('returns a list of contacts for admin filtered by email', async () => {
      // Use q filter to find the specific contact regardless of total page size
      const result = await getAdminCrmContacts({
        searchParams: { q: contactEmail },
        headers: adminCookieHeader,
      })
      expect(result.results).toBeInstanceOf(Array)
      expect(result.page_info).toMatchObject({
        has_next_page: expect.any(Boolean),
      })
      const found = result.results.find(c => c.id === contactId)
      expect(found).toBeDefined()
    })

    it('filters by status', async () => {
      // awaitingResponseContact and newStatusContact share `statusFilterToken` in their name,
      // so `q` narrows the result set to just these two fixtures regardless of status — status
      // is the only predicate left to distinguish between them. Scoping this way also sidesteps
      // the suite's dirty, parallel database, where an unscoped status query is capped at 25
      // results ordered by name and a randomly named fixture can fall outside the first page
      // even when filtering works correctly. Scoping on `q` alone (matching only
      // awaitingResponseContact) would pass even if the status predicate were dropped entirely,
      // since newStatusContact would never be in the candidate set to begin with — including it
      // here is what makes the exclusion assertion meaningful.
      const result = await getAdminCrmContacts({
        searchParams: { status: 'awaiting_response', q: statusFilterToken },
        headers: adminCookieHeader,
      })
      expect(result.results.map(c => c.id)).toContain(awaitingResponseContact.id)
      expect(result.results.map(c => c.id)).not.toContain(newStatusContact.id)
    })

    it('throws for unauthenticated request', async () => {
      await expect(getAdminCrmContacts()).rejects.toMatchObject({ name: 'ApiError', status: 401 })
    })
  })

  describe('getAdminCrmContact', () => {
    it('returns a contact with social accounts', async () => {
      const result = await getAdminCrmContact(contactId, { headers: adminCookieHeader })
      expect(result).not.toBeNull()
      expect(result!.contact.id).toBe(contactId)
      expect(result!.social_accounts).toMatchObject([
        expect.objectContaining({ platform: 'instagram' }),
      ])
    })

    it('returns null for non-existent contact', async () => {
      const result = await getAdminCrmContact('019f0000-0000-7000-8000-000000000000', {
        headers: adminCookieHeader,
      })
      expect(result).toBeNull()
    })

    it('throws for unauthenticated request', async () => {
      await expect(getAdminCrmContact(contactId)).rejects.toMatchObject({
        name: 'ApiError',
        status: 401,
      })
    })
  })
})
