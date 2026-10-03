import { randomUUID } from 'node:crypto'
import {
  createRandomString,
  createTestUser,
  insertTestVerifiedIdentity,
  restoreUser,
  setUserMarkdown,
  setUserVerificationFields,
  softDeleteUser,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type Row = Body & { id: string; username: string }
type Page = {
  success: true
  results: Row[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

const NOT_FOUND = { success: false, error: 'User not found' }
const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }
const SCOPES = ['users:read'] as const

const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const ids = (page: { results: Row[] }) => page.results.map(row => row.id)

describe('get_user and search_users — real DB', () => {
  const random = createRandomString(6).toLowerCase()
  let caller: McpContractCaller
  let admin: McpContractCaller
  let ada: Awaited<ReturnType<typeof createTestUser>>
  let grace: Awaited<ReturnType<typeof createTestUser>>
  let hidden: Awaited<ReturnType<typeof createTestUser>>

  const getUser = (user_id: string, who = caller) =>
    callStructuredMcpTool(who, 'get_user', { user_id }, SCOPES)
  const search = (args: Body, who = caller) =>
    callStructuredMcpTool(who, 'search_users', args, SCOPES) as Promise<Page>

  beforeAll(async () => {
    ;[caller, admin] = (
      await Promise.all([createTestUser(), createTestUser({ administrator: true })])
    ).map(asCaller) as McpContractCaller[]
    ;[ada, grace, hidden] = await Promise.all([
      createTestUser({ username: `ada-${random}-aa` }),
      createTestUser({ username: `grace-${random}-bb` }),
      createTestUser({ username: `ada-${random}-zz` }),
    ])
    await setUserMarkdown(ada.id, 'Analytical engines and notes')
    await softDeleteUser(hidden.id)
  })

  describe('get_user', () => {
    it('returns the public profile by id or by username, whatever the case', async () => {
      const expected = {
        success: true,
        user: {
          id: ada.id,
          username: ada.username,
          markdown: expect.stringContaining('Analytical engines and notes'),
          verification_status: null,
          verified_badge_visible: null,
          verified_display_name: null,
          account_type: null,
        },
      }

      for (const user_id of [ada.id, ada.username!, ada.username!.toUpperCase()]) {
        expect(await getUser(user_id)).toEqual(expected)
      }
    })

    it('wraps the bio as external content and leaves a missing bio null', async () => {
      const found = (await getUser(ada.id)) as { user: Body }
      const none = (await getUser(grace.id)) as { user: Body }

      expect(found.user['markdown']).not.toBe('Analytical engines and notes')
      expect(none.user['markdown']).toBeNull()
    })

    it('matches the signed-out REST profile', async () => {
      const rest = await createRequest().get(`/api/v1/users/${ada.id}`).expect(200)
      const { user } = (await getUser(ada.id)) as { user: Body }

      expect(user['id']).toBe(rest.body.user.id)
      expect(user['username']).toBe(rest.body.user.username)
      expect(Object.keys(user).every(key => key in rest.body.user)).toBe(true)
    })

    it('gives the caller their own public view, never their private fields', async () => {
      const { user } = (await getUser(caller.id)) as { user: Body }

      expect(user['id']).toBe(caller.id)
      expect(Object.keys(user).toSorted()).toEqual(
        [
          'id',
          'username',
          'markdown',
          'verification_status',
          'verified_badge_visible',
          'verified_display_name',
          'account_type',
        ].toSorted(),
      )
    })

    it('gives an administrator the same public view of another user', async () => {
      await suspendTestUser(grace.id)

      expect(await getUser(grace.id, admin)).toEqual(await getUser(grace.id))
    })

    it('shows the verified name only while the user shows the verified badge', async () => {
      const verified = await createTestUser()
      await insertTestVerifiedIdentity(
        verified.id,
        randomUUID().replaceAll('-', '').padEnd(64, '0'),
        `vs_${randomUUID()}`,
      )
      const fields = {
        verificationStatus: 'verified',
        publicVerifiedNameDisplay: 'first_name',
        verifiedFirstName: 'Alice',
        verifiedLastNameInitial: 'S',
        verifiedFullName: 'Alice Smith',
      } as const
      await setUserVerificationFields(verified.id, { ...fields, verifiedBadgeVisible: true })

      expect(await getUser(verified.id)).toMatchObject({
        user: {
          verification_status: 'verified',
          verified_badge_visible: true,
          verified_display_name: 'Alice',
        },
      })

      await setUserVerificationFields(verified.id, { ...fields, verifiedBadgeVisible: false })

      expect(await getUser(verified.id)).toMatchObject({
        user: {
          verification_status: null,
          verified_badge_visible: null,
          verified_display_name: null,
        },
      })
    })

    it('treats a deleted, an unknown and a restored-then-deleted user the same', async () => {
      const deleted = await createTestUser()
      await softDeleteUser(deleted.id)
      try {
        for (const user_id of [hidden.id, hidden.username!, deleted.id, randomUUID()]) {
          expect(await getUser(user_id)).toEqual(NOT_FOUND)
        }
      } finally {
        await restoreUser(deleted.id)
      }

      expect(await getUser(deleted.id)).toMatchObject({ user: { id: deleted.id } })
    })

    it('does not look a user up by email address or phone number', async () => {
      const withPhone = await createTestUser({ phone_number: true })

      for (const user_id of [ada.email_address!, withPhone.phone_number!]) {
        expect(await callRejectedMcpTool(caller, 'get_user', { user_id }, SCOPES)).toContain(
          'Invalid user identifier',
        )
      }
    })
  })

  describe('search_users', () => {
    it('lists the users whose username starts with the query, A to Z, case-insensitively', async () => {
      const lower = await search({ q: `ada-${random}` })
      const upper = await search({ q: `ADA-${random}` })

      expect(ids(lower)).toEqual([ada.id])
      expect(ids(upper)).toEqual([ada.id])
      expect(lower.results[0]).toEqual({
        id: ada.id,
        username: ada.username,
        markdown: expect.any(String),
        verification_status: null,
        verified_badge_visible: null,
        verified_display_name: null,
        account_type: null,
      })
    })

    it('never returns a deleted user', async () => {
      expect(ids(await search({ q: `ada-${random}-zz` }))).toEqual([])
    })

    it('returns the users in the same order as signed-in non-admin REST', async () => {
      const prefix = `user-${random}`
      const created = await Promise.all(
        ['b', 'a', 'c'].map(letter => createTestUser({ username: `${prefix}-${letter}${letter}` })),
      )
      const requester = await createTestUser()
      const rest = createRequest()
      await rest.authenticateAs(requester)
      const restPage = await rest.get(`/api/v1/users?q=${prefix}&limit=2`).expect(200)

      const page = await search({ q: prefix, limit: 2 })

      expect(created).toHaveLength(3)
      expect(ids(page)).toEqual(restPage.body.results.map((row: { id: string }) => row.id))
      expect(page.results.map(row => row.username)).toEqual([`${prefix}-aa`, `${prefix}-bb`])
      expect(page.page_info.end_cursor).toBe(restPage.body.page_info.end_cursor)
    })

    it('pages by cursor and ends the pages cleanly', async () => {
      const prefix = `page-${random}`
      await Promise.all(
        ['a', 'b', 'c'].map(letter => createTestUser({ username: `${prefix}-${letter}${letter}` })),
      )

      const first = await search({ q: prefix, limit: 2 })
      const second = await search({ q: prefix, limit: 2, after: first.page_info.end_cursor! })

      expect(first.page_info.has_next_page).toBe(true)
      expect(second.results.map(row => row.username)).toEqual([`${prefix}-cc`])
      expect(second.page_info.has_next_page).toBe(false)
      expect(second.page_info.end_cursor).toBeNull()
    })

    it('refuses a malformed cursor and a cursor from another query', async () => {
      const first = await search({ q: `page-${random}`, limit: 1 })

      expect(await search({ q: `page-${random}`, after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
      expect(await search({ q: `grace-${random}`, after: first.page_info.end_cursor! })).toEqual(
        INVALID_CURSOR,
      )
    })

    it('returns nothing for a blank query and none for an email address or an id', async () => {
      for (const q of ['', '   ', ada.email_address!, ada.id]) {
        expect(ids(await search({ q }))).toEqual([])
      }
    })

    it('gives an administrator the same public rows and no private match', async () => {
      const q = `grace-${random}`

      const adminPage = await search({ q }, admin)

      expect(ids(adminPage)).toEqual([grace.id])
      expect(adminPage).toEqual(await search({ q }))
      expect(ids(await search({ q: grace.email_address! }, admin))).toEqual([])
      expect(ids(await search({ q: grace.id }, admin))).toEqual([])
      expect(Object.keys(adminPage.results[0]!)).not.toContain('email_address')
      expect(Object.keys(adminPage.results[0]!)).not.toContain('suspended_at')
    })

    it('treats a LIKE wildcard in the query as plain text', async () => {
      expect(ids(await search({ q: '%' }))).toEqual([])
      expect(ids(await search({ q: `ada-${random}%` }))).toEqual([])
    })
  })
})
