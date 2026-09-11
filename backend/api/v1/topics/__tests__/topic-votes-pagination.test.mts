import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'

describe('GET /api/v1/topics/:id/votes pagination', () => {
  describe('admin branch (all voters)', () => {
    it('returns empty results with null cursors for a topic with no votes', async () => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic()
      const req = createRequest()
      await req.authenticateAs(admin)

      const res = await req.get(`/api/v1/topics/${topic.id}/votes`).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    it('paginates across multiple voters without duplicates or gaps', async () => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic()
      const voterA = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterB = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterC = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      for (const voter of [voterA, voterB, voterC]) {
        await req.authenticateAs(voter)
        await req.put(`/api/v1/topics/${topic.id}/vote`).send({ choice: 'like' }).expect(204)
      }

      await req.authenticateAs(admin)
      const page1 = await req.get(`/api/v1/topics/${topic.id}/votes?limit=2`).expect(200)
      expect(page1.body.results).toHaveLength(2)
      expect(page1.body.page_info.has_next_page).toBe(true)
      expect(page1.body.page_info.end_cursor).not.toBeNull()

      const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
      const page2 = await req
        .get(`/api/v1/topics/${topic.id}/votes?limit=2&after=${cursor}`)
        .expect(200)
      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.page_info.has_next_page).toBe(false)
      expect(page2.body.page_info.end_cursor).toBeNull()

      const seenUserIds = new Set(
        [...page1.body.results, ...page2.body.results].map((v: { user_id: string }) => v.user_id),
      )
      expect(seenUserIds).toEqual(new Set([voterA.id, voterB.id, voterC.id]))
    })

    it('rejects a malformed cursor with 400', async () => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic()
      const req = createRequest()
      await req.authenticateAs(admin)

      await req.get(`/api/v1/topics/${topic.id}/votes?after=not-a-real-cursor`).expect(400)
    })

    it('rejects a cursor minted for another topic with 400 (cross-resource replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const topicA = await createTestTopic()
      const topicB = await createTestTopic()
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req.put(`/api/v1/topics/${topicA.id}/vote`).send({ choice: 'like' }).expect(204)

      await req.authenticateAs(admin)
      const pageA = await req.get(`/api/v1/topics/${topicA.id}/votes?limit=1`).expect(200)
      const cursor = pageA.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req
        .get(`/api/v1/topics/${topicB.id}/votes?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    })

    it('rejects a cursor minted for a different endpoint with 400 (cross-endpoint replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic()
      const wrongScope = encodeScopedUuidCursor(v7(), `passkeys:${admin.id}:created-at-asc-id-asc`)

      const req = createRequest()
      await req.authenticateAs(admin)
      await req
        .get(`/api/v1/topics/${topic.id}/votes?after=${encodeURIComponent(wrongScope)}`)
        .expect(400)
    })
  })

  describe('user branch (own vote only)', () => {
    it('returns empty results with null cursors when the user has not voted', async () => {
      const topic = await createTestTopic()
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.get(`/api/v1/topics/${topic.id}/votes`).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    it('returns only the authenticated user vote, not other voters', async () => {
      const topic = await createTestTopic()
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const otherVoter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(otherVoter)
      await req.put(`/api/v1/topics/${topic.id}/vote`).send({ choice: 'dislike' }).expect(204)

      await req.authenticateAs(user)
      await req.put(`/api/v1/topics/${topic.id}/vote`).send({ choice: 'like' }).expect(204)

      const res = await req.get(`/api/v1/topics/${topic.id}/votes`).expect(200)
      expect(res.body.results).toHaveLength(1)
      expect(res.body.results[0]).toMatchObject({ user_id: user.id, choice: 'like' })
      expect(res.body.page_info.has_next_page).toBe(false)
    })

    it('rejects a cursor minted for the admin branch with 400 (cross-branch replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic()
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req.put(`/api/v1/topics/${topic.id}/vote`).send({ choice: 'like' }).expect(204)

      await req.authenticateAs(admin)
      const adminPage = await req.get(`/api/v1/topics/${topic.id}/votes?limit=1`).expect(200)
      const cursor = adminPage.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req.authenticateAs(voter)
      await req
        .get(`/api/v1/topics/${topic.id}/votes?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    })
  })
})
