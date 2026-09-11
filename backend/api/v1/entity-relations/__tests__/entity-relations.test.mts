import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestPost,
  insertTestTopic,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'

import { upsertEntityRelation } from '@services/entity-relations'
import { refreshEntityRelationVoteStatsById } from '@services/elections-votes/entity-relation/refresh-stats'

import { getEntityRelations } from '@services/entity-relations/query'

import { entityRelationMetadatum } from '@services/entity-relations/metadata'

import type { PrivateUser } from '@services/users/types'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { expectEntityRelationPagination } from '../test-helpers/entity-relations-pagination.mts'

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
    describe('GET /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType', () => {
      it('should return relations with vote counts', async () => {
        // Create a post and topic to relate
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: randomSlug('test-post-relations'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const topicId = await insertTestTopic({
          name: randomName('Test Topic'),
          slug: randomSlug('test-topic-relations'),
          topicType: 'card',
          createdById: user!.id,
        })
        // Create entity relation (post -> category -> topic)
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
        )!
        await upsertEntityRelation(user!, metadata, { id: postId }, [{ id: topicId }])

        // Test as unauthenticated user
        const unauthRequest = createRequest()
        const unauthResponse = await unauthRequest
          .get(`/api/v1/entity-relations/post/${postId}/category/topic`)
          .expect(200)

        expect(unauthResponse.body).toHaveProperty('results')
        expect(unauthResponse.body).toHaveProperty('entity_relations')
        expect(Array.isArray(unauthResponse.body.results)).toBe(true)
        expect(unauthResponse.body.results.length).toBeGreaterThan(0)
        const firstRef = unauthResponse.body.results[0]
        expect(firstRef).toHaveProperty('id')
        const firstRelation = unauthResponse.body.entity_relations[firstRef.id]
        expect(firstRelation).toHaveProperty('votes_count_up')
        expect(firstRelation).toHaveProperty('votes_count_down')

        // entity_relation_elections should be returned for all users (unauthenticated included)
        expect(typeof unauthResponse.body.entity_relation_elections).toBe('object')
        expect(Array.isArray(unauthResponse.body.entity_relation_elections)).toBe(false)

        // Should not return election_votes for unauthenticated users
        expect(unauthResponse.body.election_votes).toBeUndefined()

        // Should set Cache-Control for unauthenticated users
        expect(unauthResponse.headers['cache-control']).toContain('public')
        expect(unauthResponse.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )

        // Test as authenticated user
        const authRequest = createRequest()
        await authRequest.authenticateAs(user!)
        const authResponse = await authRequest
          .get(`/api/v1/entity-relations/post/${postId}/category/topic`)
          .expect(200)

        expect(authResponse.body).toHaveProperty('results')
        expect(authResponse.body).toHaveProperty('election_votes')
        expect(authResponse.body.results.length).toBeGreaterThan(0)

        // entity_relation_elections should be returned for authenticated users too
        expect(typeof authResponse.body.entity_relation_elections).toBe('object')
        expect(Array.isArray(authResponse.body.entity_relation_elections)).toBe(false)

        // The relation we created must appear in results and have an election entry
        const relation = unauthResponse.body.entity_relations[firstRef.id]
        expect(unauthResponse.body.entity_relation_elections[relation.id]).toBeDefined()
        expect(unauthResponse.body.entity_relation_elections[relation.id]).toHaveProperty(
          'votes_score_net',
        )
        await expectEntityRelationPagination(user)
      })

      it('should return user election votes when authenticated', async () => {
        // Create a post and topic to relate
        const postId = await insertTestPost({
          title: 'Test Post 2',
          slug: randomSlug('test-post-votes'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const topicId = await insertTestTopic({
          name: randomName('Test Topic'),
          slug: randomSlug('test-topic-votes'),
          topicType: 'card',
          createdById: user!.id,
        })
        // Create entity relation
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
        )!
        const relations = await upsertEntityRelation(user!, metadata, { id: postId }, [
          { id: topicId },
        ])
        const relation = relations[0]

        // Vote on the relation
        const voteRequest = createRequest()
        await voteRequest.authenticateAs(user!)
        await voteRequest
          .put(`/api/v1/entity-relations/${relation.id}/vote`)
          .send({ choice: 'confirm' })
          .expect(204)

        // Get relations as authenticated user
        const request = createRequest()
        await request.authenticateAs(user!)
        const response = await request
          .get(`/api/v1/entity-relations/post/${postId}/category/topic`)
          .expect(200)

        // Should return election_votes with user's vote
        expect(response.body).toHaveProperty('election_votes')
        expect(response.body.election_votes).toBeDefined()
        expect(response.body.election_votes[relation.id!]).toBeDefined()
        expect(response.body.election_votes[relation.id!].choice).toBe('confirm')
      })

      it('should filter by minNetVoteScore when specified', async () => {
        // Create a post and two topics
        const postId = await insertTestPost({
          title: 'Test Post Filter',
          slug: randomSlug('test-post-filter'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const topicId1 = await insertTestTopic({
          name: randomName('Test Topic Filter'),
          slug: randomSlug('test-topic-filter-1'),
          topicType: 'card',
          createdById: user!.id,
        })
        const topicId2 = await insertTestTopic({
          name: randomName('Test Topic Filter'),
          slug: randomSlug('test-topic-filter-2'),
          topicType: 'card',
          createdById: user!.id,
        })
        // Create two entity relations
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
        )!
        const relation1 = (
          await upsertEntityRelation(user!, metadata, { id: postId }, [{ id: topicId1 }])
        )[0]
        const relation2 = (
          await upsertEntityRelation(user!, metadata, { id: postId }, [{ id: topicId2 }])
        )[0]
        await Promise.all(
          [relation1, relation2].map(relation => refreshEntityRelationVoteStatsById(relation.id!)),
        )

        // Downvote one relation
        const voteRequest = createRequest()
        await voteRequest.authenticateAs(user!)
        await voteRequest
          .put(`/api/v1/entity-relations/${relation2.id}/vote`)
          .send({ choice: 'dispute' })
          .expect(204)
        await refreshEntityRelationVoteStatsById(relation2.id!)

        // Query with minNetVoteScore=1 should include Confirm (+1) and exclude Dispute (-1).
        const request = createRequest()
        const response = await request
          .get(`/api/v1/entity-relations/post/${postId}/category/topic?minNetVoteScore=1`)
          .expect(200)

        // Should have exactly 1 relation (relation1 with a positive score).
        expect(response.body.results.length).toBe(1)
        const filteredRef = response.body.results[0]
        const filteredRelation = response.body.entity_relations[filteredRef.id]
        expect(filteredRelation.object_id).toBe(topicId1)
        expect(filteredRelation.votes_score_net).toBeGreaterThanOrEqual(1)

        // Relation2 is filtered out after its Dispute choice leaves it below the threshold.
        expect(
          Object.values(
            response.body.entity_relations as Record<string, { object_id: string }>,
          ).find(r => r.object_id === topicId2),
        ).toBeUndefined()
      })

      it('should filter by positiveNetVoteScore when specified', async () => {
        const postId = await insertTestPost({
          title: 'Test Post PosScore',
          slug: randomSlug('test-post-posscore'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const topicId1 = await insertTestTopic({
          name: randomName('Test Topic PosScore'),
          slug: randomSlug('test-topic-posscore-1'),
          topicType: 'card',
          createdById: user!.id,
        })
        const topicId2 = await insertTestTopic({
          name: randomName('Test Topic PosScore'),
          slug: randomSlug('test-topic-posscore-2'),
          topicType: 'card',
          createdById: user!.id,
        })
        const metadata = entityRelationMetadatum.find(
          m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
        )!
        const relation1 = (
          await upsertEntityRelation(user!, metadata, { id: postId }, [{ id: topicId1 }])
        )[0]
        const relation2 = (
          await upsertEntityRelation(user!, metadata, { id: postId }, [{ id: topicId2 }])
        )[0]
        await Promise.all(
          [relation1, relation2].map(relation => refreshEntityRelationVoteStatsById(relation.id!)),
        )

        const voteRequest = createRequest()
        await voteRequest.authenticateAs(user!)
        await voteRequest
          .put(`/api/v1/entity-relations/${relation2.id}/vote`)
          .send({ choice: 'dispute' })
          .expect(204)
        await refreshEntityRelationVoteStatsById(relation2.id!)

        const request = createRequest()
        const response = await request
          .get(`/api/v1/entity-relations/post/${postId}/category/topic?positiveNetVoteScore=true`)
          .expect(200)

        expect(response.body.results.length).toBe(1)
        const filteredRef = response.body.results[0]
        const filteredRelation = response.body.entity_relations[filteredRef.id]
        expect(filteredRelation.object_id).toBe(topicId1)
        expect(filteredRelation.votes_score_net).toBeGreaterThan(0)
        expect(
          Object.values(
            response.body.entity_relations as Record<string, { object_id: string }>,
          ).find(r => r.object_id === topicId2),
        ).toBeUndefined()
      })

      it('should return empty array when no relations exist', async () => {
        const postId = await insertTestPost({
          title: 'Test Post Empty',
          slug: randomSlug('test-post-empty'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        const response = await request
          .get(`/api/v1/entity-relations/post/${postId}/category/topic`)
          .expect(200)

        expect(response.body.results).toEqual([])
        expect(response.body.entity_relations).toEqual({})
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getEntityRelations)
})
