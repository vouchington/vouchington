import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'

import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'

import type { PrivateUser } from '@services/users/types'

const slug = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

function metadataFor(subjectType: string, predicate: string, objectType: string) {
  return entityRelationMetadatum.find(
    m =>
      m.subject_type === subjectType && m.predicate === predicate && m.object_type === objectType,
  )!
}

async function insertTopic(createdById: string): Promise<string> {
  return insertTestTopic({
    name: slug('Visibility Topic'),
    slug: slug('visibility-topic'),
    topicType: 'card',
    createdById,
  })
}

async function insertPost(
  createdById: string,
  options: { privacy?: 'public' | 'private'; isAnonymous?: boolean } = {},
): Promise<string> {
  return insertTestPost({
    title: slug('Visibility Post'),
    slug: slug('visibility-post'),
    createdById,
    markdown: 'Visibility body',
    // Private posts cannot broadcast to everyone; followers-only keeps the post off-limits to
    // members who do not follow the author.
    ...(options.privacy === 'private' ? { broadcast: 'followers' as const } : {}),
    ...options,
  })
}

type RelationBody = {
  results: { id: string }[]
  entity_relations: Record<string, { object_id: string; created_by_id: string | null }>
}

async function listRelations(path: string, viewer?: PrivateUser): Promise<RelationBody> {
  const request = createRequest()
  if (viewer) await request.authenticateAs(viewer)
  const response = await request.get(`/api/v1/entity-relations/${path}`).expect(200)
  return response.body as RelationBody
}

describe('entity-relations visibility', () => {
  let author: PrivateUser
  let otherUser: PrivateUser
  let administrator: PrivateUser

  beforeAll(async () => {
    author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    otherUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    administrator = await createTestUser({ administrator: true })
  })

  describe('anonymous post authors', () => {
    let anonymousPostId: string
    let path: string

    beforeAll(async () => {
      anonymousPostId = await insertPost(author.id, { isAnonymous: true })
      const topicId = await insertTopic(author.id)
      await upsertEntityRelation(
        author,
        metadataFor('post', 'category', 'topic'),
        {
          id: anonymousPostId,
        },
        [{ id: topicId }],
      )
      path = `post/${anonymousPostId}/category/topic`
    })

    it('masks the author as relation creator for signed-out viewers', async () => {
      const body = await listRelations(path)
      const relations = Object.values(body.entity_relations)
      expect(relations).toHaveLength(1)
      expect(relations[0]!.created_by_id).toBeNull()
    })

    it('masks the author as relation creator for other members', async () => {
      const body = await listRelations(path, otherUser)
      expect(Object.values(body.entity_relations)[0]!.created_by_id).toBeNull()
    })

    it('shows the author their own relation', async () => {
      const body = await listRelations(path, author)
      expect(Object.values(body.entity_relations)[0]!.created_by_id).toBe(author.id)
    })

    it('shows administrators the relation creator', async () => {
      const body = await listRelations(path, administrator)
      expect(Object.values(body.entity_relations)[0]!.created_by_id).toBe(author.id)
    })

    it('keeps other members attributed on relations they created', async () => {
      const topicId = await insertTopic(otherUser.id)
      await upsertEntityRelation(
        otherUser,
        metadataFor('post', 'category', 'topic'),
        {
          id: anonymousPostId,
        },
        [{ id: topicId }],
      )
      const body = await listRelations(path)
      const relation = Object.values(body.entity_relations).find(r => r.object_id === topicId)
      expect(relation!.created_by_id).toBe(otherUser.id)
    })

    it('masks the author when an anonymous post is the relation object', async () => {
      const topicId = await insertTopic(author.id)
      const faqPostId = await insertPost(author.id, { isAnonymous: true })
      await upsertEntityRelation(author, metadataFor('topic', 'faq', 'post'), { id: topicId }, [
        { id: faqPostId },
      ])
      const body = await listRelations(`topic/${topicId}/faq/post`)
      expect(Object.values(body.entity_relations)[0]!.created_by_id).toBeNull()
    })

    it('does not return the author when another member re-adds an existing relation', async () => {
      const topicId = await insertTopic(author.id)
      await upsertEntityRelation(
        author,
        metadataFor('post', 'category', 'topic'),
        {
          id: anonymousPostId,
        },
        [{ id: topicId }],
      )
      const request = createRequest()
      await request.authenticateAs(otherUser)
      const response = await request
        .post(`/api/v1/entity-relations/post/${anonymousPostId}/category/topic`)
        .send({ objectId: topicId })
        .expect(201)
      expect(response.body.relation.object_id).toBe(topicId)
      expect(response.body.relation.created_by_id).toBeNull()
      expect(response.body.relation.object_data).toEqual(
        expect.objectContaining({ id: topicId, topic_type: 'card' }),
      )
    })
  })

  describe('post visibility', () => {
    it('omits private object posts from viewers who cannot read them', async () => {
      const topicId = await insertTopic(author.id)
      const privatePostId = await insertPost(author.id, { privacy: 'private' })
      const publicPostId = await insertPost(author.id)
      await upsertEntityRelation(author, metadataFor('topic', 'faq', 'post'), { id: topicId }, [
        { id: privatePostId },
        { id: publicPostId },
      ])
      const objectIds = (body: RelationBody) =>
        Object.values(body.entity_relations).map(relation => relation.object_id)

      expect(objectIds(await listRelations(`topic/${topicId}/faq/post`))).toEqual([publicPostId])
      expect(objectIds(await listRelations(`topic/${topicId}/faq/post`, otherUser))).toEqual([
        publicPostId,
      ])
      expect(
        objectIds(await listRelations(`topic/${topicId}/faq/post`, author)).toSorted(),
      ).toEqual([privatePostId, publicPostId].toSorted())
    })

    it('returns no relations for a subject post the viewer cannot read', async () => {
      const privatePostId = await insertPost(author.id, { privacy: 'private' })
      const topicId = await insertTopic(author.id)
      await upsertEntityRelation(
        author,
        metadataFor('post', 'category', 'topic'),
        {
          id: privatePostId,
        },
        [{ id: topicId }],
      )
      const path = `post/${privatePostId}/category/topic`

      expect((await listRelations(path)).results).toEqual([])
      expect((await listRelations(path, otherUser)).results).toEqual([])
      expect((await listRelations(path, author)).results).toHaveLength(1)
      expect((await listRelations(path, administrator)).results).toHaveLength(1)
    })

    it('rejects relating a subject post the viewer cannot read', async () => {
      const privatePostId = await insertPost(author.id, { privacy: 'private' })
      const topicId = await insertTopic(author.id)
      const request = createRequest()
      await request.authenticateAs(otherUser)
      await request
        .post(`/api/v1/entity-relations/post/${privatePostId}/category/topic`)
        .send({ objectId: topicId })
        .expect(404)
    })

    it('rejects relating an object post the viewer cannot read', async () => {
      const privatePostId = await insertPost(author.id, { privacy: 'private' })
      const topicId = await insertTopic(author.id)
      const request = createRequest()
      await request.authenticateAs(otherUser)
      await request
        .post(`/api/v1/entity-relations/topic/${topicId}/faq/post`)
        .send({ objectId: privatePostId })
        .expect(404)
    })

    it('rejects relating a post id that is not a UUID', async () => {
      const topicId = await insertTopic(author.id)
      const request = createRequest()
      await request.authenticateAs(otherUser)
      await request
        .post(`/api/v1/entity-relations/topic/${topicId}/faq/post`)
        .send({ objectId: 'not-a-post-id' })
        .expect(404)
    })
  })
})
