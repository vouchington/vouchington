/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { describe, expect, test } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'

/** Shared admin and owner vote-list cases. Call from a literal `describe` in the route test. */
export function registerVoteListPaginationTests(options: {
  segment: string
  createId: (adminId: string) => Promise<string>
  ownChoice: string
  otherChoice: string
}): void {
  const votesPath = (id: string) => `/api/v1/${options.segment}/${id}/votes`
  const votePath = (id: string) => `/api/v1/${options.segment}/${id}/vote`

  describe('admin branch (all voters)', () => {
    test('returns empty results with null cursors when the resource has no votes', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const req = createRequest()
      await req.authenticateAs(admin)

      const res = await req.get(votesPath(id)).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    test('paginates across multiple voters without duplicates or gaps', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const voterA = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterB = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterC = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      for (const voter of [voterA, voterB, voterC]) {
        await req.authenticateAs(voter)
        await req.put(votePath(id)).send({ choice: options.ownChoice }).expect(204)
      }

      await req.authenticateAs(admin)
      const page1 = await req.get(`${votesPath(id)}?limit=2`).expect(200)
      expect(page1.body.results).toHaveLength(2)
      expect(page1.body.page_info.has_next_page).toBe(true)
      expect(page1.body.page_info.end_cursor).not.toBeNull()

      const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
      const page2 = await req.get(`${votesPath(id)}?limit=2&after=${cursor}`).expect(200)
      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.page_info.has_next_page).toBe(false)
      expect(page2.body.page_info.end_cursor).toBeNull()

      const seenUserIds = new Set(
        [...page1.body.results, ...page2.body.results].map((v: { user_id: string }) => v.user_id),
      )
      expect(seenUserIds).toEqual(new Set([voterA.id, voterB.id, voterC.id]))
    })

    test('rejects a malformed cursor with 400', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const req = createRequest()
      await req.authenticateAs(admin)

      await req.get(`${votesPath(id)}?after=not-a-real-cursor`).expect(400)
    })

    test('rejects a cursor minted for another resource with 400 (cross-resource replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const idA = await options.createId(admin.id)
      const idB = await options.createId(admin.id)
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req.put(votePath(idA)).send({ choice: options.ownChoice }).expect(204)

      await req.authenticateAs(admin)
      const pageA = await req.get(`${votesPath(idA)}?limit=1`).expect(200)
      const cursor = pageA.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req.get(`${votesPath(idB)}?after=${encodeURIComponent(cursor)}`).expect(400)
    })

    test('rejects a cursor minted for a different endpoint with 400 (cross-endpoint replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const wrongScope = encodeScopedUuidCursor(v7(), `passkeys:${admin.id}:created-at-asc-id-asc`)

      const req = createRequest()
      await req.authenticateAs(admin)
      await req.get(`${votesPath(id)}?after=${encodeURIComponent(wrongScope)}`).expect(400)
    })
  })

  describe('user branch (own vote only)', () => {
    test('returns empty results with null cursors when the user has not voted', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.get(votesPath(id)).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    test('returns only the authenticated user vote, not other voters', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const otherVoter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(otherVoter)
      await req.put(votePath(id)).send({ choice: options.otherChoice }).expect(204)

      await req.authenticateAs(user)
      await req.put(votePath(id)).send({ choice: options.ownChoice }).expect(204)

      const res = await req.get(votesPath(id)).expect(200)
      expect(res.body.results).toHaveLength(1)
      expect(res.body.results[0]).toMatchObject({ user_id: user.id, choice: options.ownChoice })
      expect(res.body.page_info.has_next_page).toBe(false)
    })

    test('rejects a cursor minted for the admin branch with 400 (cross-branch replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const id = await options.createId(admin.id)
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req.put(votePath(id)).send({ choice: options.ownChoice }).expect(204)

      await req.authenticateAs(admin)
      const adminPage = await req.get(`${votesPath(id)}?limit=1`).expect(200)
      const cursor = adminPage.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req.authenticateAs(voter)
      await req.get(`${votesPath(id)}?after=${encodeURIComponent(cursor)}`).expect(400)
    })
  })
}
