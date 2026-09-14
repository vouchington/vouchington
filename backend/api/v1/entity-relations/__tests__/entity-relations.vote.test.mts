import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'

describe('entity-relations.vote', () => {
  let user: PrivateUser

  function randomSlug(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  describe('Entity Relation Vote Routes', () => {
    describe('PUT /api/v1/entity-relations/:id/vote', () => {
      it('should allow authenticated user to vote on entity relation', async () => {
        const postId1 = await insertTestPost({
          title: 'Test Post 1',
          slug: randomSlug('test-post-er-vote-1'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post 2',
          slug: randomSlug('test-post-er-vote-2'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        // Create entity relation
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(204)
      })

      it('should return 401 when not authenticated', async () => {
        const postId1 = await insertTestPost({
          title: 'Test Post 1',
          slug: randomSlug('test-post-er-vote-401-1'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post 2',
          slug: randomSlug('test-post-er-vote-401-2'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(401)
      })

      it('should return 422 for invalid score value', async () => {
        const postId1 = await insertTestPost({
          title: 'Test Post 1',
          slug: randomSlug('test-post-er-vote-422-1'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post 2',
          slug: randomSlug('test-post-er-vote-422-2'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'invalid' })
          .expect(422)
      })

      it('should return 404 for non-existent entity relation', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .put('/api/v1/entity-relations/00000000-0000-0000-0000-000000000000/vote')
          .send({ choice: 'confirm' })
          .expect(404)
      })

      it('should allow official account (administrator role) to vote on entity relation', async () => {
        const adminUser = await createTestUser({ administrator: true })
        const postId1 = await insertTestPost({
          title: 'Test Post Official Vote 1',
          slug: randomSlug('test-post-official-vote-1'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post Official Vote 2',
          slug: randomSlug('test-post-official-vote-2'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request.authenticateAs(adminUser)

        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(204)
      })
    })

    describe('GET /api/v1/entity-relations/:id/votes', () => {
      it('should return user votes when authenticated', async () => {
        const postId1 = await insertTestPost({
          title: 'Test Post 1',
          slug: randomSlug('test-post-er-votes-1'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post 2',
          slug: randomSlug('test-post-er-votes-2'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(204)

        const response = await request
          .get(`/api/v1/entity-relations/${relation.id}/votes`)
          .expect(200)

        expect(response.body).toHaveProperty('results')
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.length).toBe(1)
        expect(response.body.results[0]).toHaveProperty('entity_id', relation.id)
        expect(response.body.results[0]).toHaveProperty('user_id', user!.id)
        expect(response.body.results[0]).toHaveProperty('choice', 'confirm')
      })

      it('should return 401 when not authenticated', async () => {
        const postId1 = await insertTestPost({
          title: 'Test Post 1',
          slug: randomSlug('test-post-er-votes-401-1'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post 2',
          slug: randomSlug('test-post-er-votes-401-2'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request.get(`/api/v1/entity-relations/${relation.id}/votes`).expect(401)
      })

      it('should return all votes for administrators', async () => {
        const user1 = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const user2 = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const admin = await createTestUser({ administrator: true })
        const postId1 = await insertTestPost({
          title: 'Test Post Admin Votes 1',
          slug: randomSlug('test-post-er-admin-1'),
          createdById: user1!.id,
          markdown: 'Test content',
        })
        const postId2 = await insertTestPost({
          title: 'Test Post Admin Votes 2',
          slug: randomSlug('test-post-er-admin-2'),
          createdById: user1!.id,
          markdown: 'Test content',
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
        )!
        const relations = await upsertEntityRelation(user1!, metadata, { id: postId1 }, [
          { id: postId2 },
        ])
        const relation = relations[0]

        const request = createRequest()
        await request.authenticateAs(user1!)
        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(204)

        await request.authenticateAs(user2!)
        await request
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'dispute' })
          .expect(204)

        await request.authenticateAs(admin!)
        const response = await request
          .get(`/api/v1/entity-relations/${relation.id}/votes`)
          .expect(200)

        expect(response.body).toHaveProperty('results')
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.length).toBe(2)
      })

      it('should return 404 for non-existent entity relation', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .get('/api/v1/entity-relations/00000000-0000-0000-0000-000000000000/votes')
          .expect(404)
      })
    })
  })
})
