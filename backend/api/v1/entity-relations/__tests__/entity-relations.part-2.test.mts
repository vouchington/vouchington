import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestPost,
  insertTestTopic,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'

import { upsertEntityRelation } from '@services/entity-relations'

import { getEntityRelations } from '@services/entity-relations/query'

import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { getPublisherTypeTopicId } from '@services/topics/publisher-type-topics'

import type { PrivateUser } from '@services/users/types'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('entity-relations', () => {
  let user: PrivateUser

  function randomSlug(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  function randomName(base: string): string {
    return `${base} ${crypto.randomUUID().slice(0, 8)}`
  }

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  describe('Entity Relations API', () => {
    describe('user-object relations use public view (no sensitive columns)', () => {
      it('object_data for user objects excludes sensitive columns', async () => {
        // post -> mentioned -> user is a valid non-user-subject relation.
        // It has no election id column so the HTTP route filters it; test via service directly.
        const postId = await insertTestPost({
          title: 'Test Mention Post',
          slug: randomSlug('test-mention-post'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const mentionedUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'user' && m.predicate === 'mentioned',
        )!
        await upsertEntityRelation(user!, metadata, { id: postId }, [{ id: mentionedUser.id }])

        // Call the service directly (HTTP layer filters non-election rows via relationsWithId)
        const relations = await getEntityRelations('post', postId, 'mentioned', 'user')

        expect(relations.length).toBeGreaterThan(0)
        const objectData = relations[0].object_data

        // Public columns should be present (from view_users_public)
        expect(objectData).toHaveProperty('id')
        expect(objectData).toHaveProperty('username')

        // Sensitive columns must NOT be exposed
        expect(objectData).not.toHaveProperty('vote_weight')
        expect(objectData).not.toHaveProperty('suspended_reason')
        expect(objectData).not.toHaveProperty('suspended_by_id')
        expect(objectData).not.toHaveProperty('processing_restricted_at')
      })
    })

    describe('user-subject relations are blocked', () => {
      it('rejects GET /api/v1/entity-relations/user/:id/follow/user with 400', async () => {
        const request = createRequest()
        await request.get(`/api/v1/entity-relations/user/${user.id}/follow/user`).expect(400)
      })

      it('rejects GET even when authenticated', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(`/api/v1/entity-relations/user/${user.id}/follow/user`).expect(400)
      })

      it('rejects POST /api/v1/entity-relations/user/:id/follow/user with 400', async () => {
        const otherUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const request = createRequest()
        await request.authenticateAs(user)
        await request
          .post(`/api/v1/entity-relations/user/${user.id}/follow/user`)
          .send({ objectId: otherUser.id })
          .expect(400)
      })

      it.each(['save', 'follow', 'mute', 'block', 'dismiss_recommendation'])(
        'rejects POST for user-subject predicate "%s"',
        async predicate => {
          const request = createRequest()
          await request.authenticateAs(user)
          await request
            .post(`/api/v1/entity-relations/user/${user.id}/${predicate}/user`)
            .send({ objectId: crypto.randomUUID() })
            .expect(400)
        },
      )
    })

    describe('GET /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType', () => {
      it('should reject a malformed pagination cursor with 400', async () => {
        const request = createRequest()
        const postId = crypto.randomUUID()
        await request
          .get(`/api/v1/entity-relations/post/${postId}/category/topic?after=not-a-valid-cursor`)
          .expect(400)
      })
    })

    describe('POST /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType', () => {
      it('should create a new entity relation when authenticated', async () => {
        const postId = await insertTestPost({
          title: 'Test Post Create',
          slug: randomSlug('test-post-create'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const topicId = await insertTestTopic({
          name: randomName('Test Topic Create'),
          slug: randomSlug('test-topic-create'),
          topicType: 'card',
          createdById: user!.id,
        })
        const request = createRequest()
        await request.authenticateAs(user!)
        const response = await request
          .post(`/api/v1/entity-relations/post/${postId}/category/topic`)
          .send({ objectId: topicId })
          .expect(201)

        expect(response.body).toHaveProperty('relation')
        expect(response.body.relation.subject_id).toBe(postId)
        expect(response.body.relation.object_id).toBe(topicId)
        expect(response.body.relation.id).toBeDefined()
      })

      it('should require authentication', async () => {
        const request = createRequest()
        await request
          .post('/api/v1/entity-relations/post/123/category/topic')
          .send({ objectId: '456' })
          .expect(401)
      })

      it('should validate required objectId in body', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)
        await request.post('/api/v1/entity-relations/post/123/category/topic').send({}).expect(400)
      })
    })
  })

  describe('publisher_type enum validation', () => {
    let sourceTopicId: string
    let cardTopicId: string
    let randomTopicId: string

    beforeAll(async () => {
      sourceTopicId = await insertTestTopic({
        name: randomName('Pub Source Topic'),
        slug: randomSlug('pub-source'),
        topicType: 'rss_feed',
        createdById: user!.id,
      })
      cardTopicId = await insertTestTopic({
        name: randomName('Pub Type Card Topic'),
        slug: randomSlug('pub-type-card'),
        topicType: 'card',
        createdById: user!.id,
      })
      randomTopicId = await insertTestTopic({
        name: randomName('Not A Publisher Type'),
        slug: randomSlug('not-pub-type'),
        createdById: user!.id,
      })
    })

    it('rejects a publisher_type relation when the object is not a known publisher type (422)', async () => {
      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request
        .post(`/api/v1/entity-relations/topic/${sourceTopicId}/publisher_type/topic`)
        .send({ objectId: randomTopicId })
        .expect(422)
      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toMatch(/invalid publisher type/i)
    })

    it('rejects a publisher_type relation when the subject is not a source topic (422)', async () => {
      const publisherTypeTopicId = await getPublisherTypeTopicId('blog')
      if (!publisherTypeTopicId) throw new Error('Expected blog publisher type topic to be seeded')

      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request
        .post(`/api/v1/entity-relations/topic/${cardTopicId}/publisher_type/topic`)
        .send({ objectId: publisherTypeTopicId })
        .expect(422)
      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toMatch(/source topic/i)
    })
  })

  describe('route parameter validation', () => {
    it('rejects an invalid entity type', async () => {
      const request = createRequest()
      await request.get('/api/v1/entity-relations/invalid-type/123/related/topic').expect(400)
    })

    it('rejects an invalid object type', async () => {
      const request = createRequest()
      await request.get('/api/v1/entity-relations/post/123/related/invalid-type').expect(400)
    })

    it('rejects an invalid predicate', async () => {
      const request = createRequest()
      await request.get('/api/v1/entity-relations/post/123/invalid-predicate/topic').expect(400)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
})
