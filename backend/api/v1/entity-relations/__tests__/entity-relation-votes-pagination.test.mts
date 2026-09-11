import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestUserWithAge,
  insertTestPost,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'

function randomSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

async function createTestEntityRelation(creator: PrivateUser) {
  const postId1 = await insertTestPost({
    title: 'Entity Relation Votes Pagination 1',
    slug: randomSlug('er-votes-pagination-1'),
    createdById: creator.id,
    markdown: 'Test content',
  })
  const postId2 = await insertTestPost({
    title: 'Entity Relation Votes Pagination 2',
    slug: randomSlug('er-votes-pagination-2'),
    createdById: creator.id,
    markdown: 'Test content',
  })
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
  )!
  const relations = await upsertEntityRelation(
    creator,
    metadata,
    { id: postId1 },
    [{ id: postId2 }],
    { vote: false },
  )
  return relations[0]
}

describe('GET /api/v1/entity-relations/:id/votes pagination', () => {
  describe('admin branch (all voters)', () => {
    it('returns empty results with null cursors for an entity relation with no votes', async () => {
      const admin = await createTestUser({ administrator: true })
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)

      const req = createRequest()
      await req.authenticateAs(admin)

      const res = await req.get(`/api/v1/entity-relations/${relation.id}/votes`).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    it('paginates across multiple voters without duplicates or gaps', async () => {
      const admin = await createTestUser({ administrator: true })
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      const voterA = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterB = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterC = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      for (const voter of [voterA, voterB, voterC]) {
        await req.authenticateAs(voter)
        await req
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(204)
      }

      await req.authenticateAs(admin)
      const page1 = await req
        .get(`/api/v1/entity-relations/${relation.id}/votes?limit=2`)
        .expect(200)
      expect(page1.body.results).toHaveLength(2)
      expect(page1.body.page_info.has_next_page).toBe(true)
      expect(page1.body.page_info.end_cursor).not.toBeNull()

      const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
      const page2 = await req
        .get(`/api/v1/entity-relations/${relation.id}/votes?limit=2&after=${cursor}`)
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
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      const req = createRequest()
      await req.authenticateAs(admin)

      await req
        .get(`/api/v1/entity-relations/${relation.id}/votes?after=not-a-real-cursor`)
        .expect(400)
    })

    it('rejects a cursor minted for another entity relation with 400 (cross-resource replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relationA = await createTestEntityRelation(creator)
      const relationB = await createTestEntityRelation(creator)
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req
        .put(`/api/v1/entity-relations/${relationA.id}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)

      await req.authenticateAs(admin)
      const pageA = await req
        .get(`/api/v1/entity-relations/${relationA.id}/votes?limit=1`)
        .expect(200)
      const cursor = pageA.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req
        .get(`/api/v1/entity-relations/${relationB.id}/votes?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    })

    it('rejects a cursor minted for a different endpoint with 400 (cross-endpoint replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      const wrongScope = encodeScopedUuidCursor(v7(), `passkeys:${admin.id}:created-at-asc-id-asc`)

      const req = createRequest()
      await req.authenticateAs(admin)
      await req
        .get(
          `/api/v1/entity-relations/${relation.id}/votes?after=${encodeURIComponent(wrongScope)}`,
        )
        .expect(400)
    })
  })

  describe('user branch (own vote only)', () => {
    it('returns empty results with null cursors when the user has not voted', async () => {
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.get(`/api/v1/entity-relations/${relation.id}/votes`).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    it('returns only the authenticated user vote, not other voters', async () => {
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const otherVoter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(otherVoter)
      await req
        .put(`/api/v1/entity-relations/${relation.id}/vote`)
        .send({ choice: 'dispute' })
        .expect(204)

      await req.authenticateAs(user)
      await req
        .put(`/api/v1/entity-relations/${relation.id}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)

      const res = await req.get(`/api/v1/entity-relations/${relation.id}/votes`).expect(200)
      expect(res.body.results).toHaveLength(1)
      expect(res.body.results[0]).toMatchObject({ user_id: user.id, choice: 'confirm' })
      expect(res.body.page_info.has_next_page).toBe(false)
    })

    it('rejects a cursor minted for the admin branch with 400 (cross-branch replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req
        .put(`/api/v1/entity-relations/${relation.id}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)

      await req.authenticateAs(admin)
      const adminPage = await req
        .get(`/api/v1/entity-relations/${relation.id}/votes?limit=1`)
        .expect(200)
      const cursor = adminPage.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req.authenticateAs(voter)
      await req
        .get(`/api/v1/entity-relations/${relation.id}/votes?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    })
  })
})
