import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicRecommendation } from '@services/topic-recommendations'
import { getPostElectionVote } from '@services/elections-votes/post'

describe('post.vote', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  describe('Post Vote Routes', () => {
    describe('PUT /api/v1/posts/:id/vote', () => {
      it('allows authenticated users to vote on a post', async () => {
        const post = await createTestPost({ user })

        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
      })

      it('returns Support, rather than the sentiment Like alias, for a topic recommendation', async () => {
        const creator = await createTestUser()
        const voter = await createTestUser()
        const random = Date.now()
        const rec = await createTopicRecommendation(WEB_PROVENANCE, creator, {
          markdown: 'Regression test for topic recommendation voting.',
          topic_title: `Vote Regression Topic ${random}`,
          topic_slug: `vote-regression-topic-${random}`,
        })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${rec.id}/vote`).send({ choice: 'support' }).expect(204)

        await expect(getPostElectionVote(voter.id, rec.id)).resolves.toMatchObject({
          choice: 'support',
        })
        const response = await request.get(`/api/v1/posts/${rec.id}/votes`).expect(200)
        expect(response.body.results).toEqual([
          expect.objectContaining({
            __entity_type: 'election_vote',
            entity_id: rec.id,
            user_id: voter.id,
            choice: 'support',
          }),
        ])
      })

      it('uses sentiment for a comment beneath a topic recommendation', async () => {
        const recommendation = await createTopicRecommendation(WEB_PROVENANCE, user, {
          markdown: 'A recommendation with a comment-specific vote policy.',
          topic_title: `Comment vote policy ${crypto.randomUUID()}`,
          topic_slug: `comment-vote-policy-${crypto.randomUUID()}`,
        })
        const commentId = await insertTestPost({
          title: '',
          slug: `comment-on-recommendation-${crypto.randomUUID()}`,
          createdById: user.id,
          markdown: 'A comment should not inherit the root recommendation policy.',
          postType: 'comment',
          rootId: recommendation.id,
          parentId: recommendation.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/posts/${commentId}/vote`).send({ choice: 'like' }).expect(204)

        await expect(getPostElectionVote(user.id, commentId)).resolves.toMatchObject({
          choice: 'like',
        })
      })
    })

    describe('PUT /api/v1/posts/:id/vote Neutral', () => {
      it('retracts the authenticated user semantic ballot to Neutral', async () => {
        const post = await createTestPost({ user })
        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)

        await expect(getPostElectionVote(user.id, post.id)).resolves.toMatchObject({
          choice: 'neutral',
        })
      })
    })

    describe('GET /api/v1/posts/:id/votes', () => {
      it('returns the authenticated user vote for a post', async () => {
        const post = await createTestPost({ user })

        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)

        const response = await request.get(`/api/v1/posts/${post.id}/votes`).expect(200)

        expect(response.body).toHaveProperty('results')
        expect(response.body.results).toHaveLength(1)
        expect(response.body.results[0]).toHaveProperty('__entity_type', 'election_vote')
        expect(response.body.results[0]).toHaveProperty('entity_id', post.id)
        expect(response.body.results[0]).toHaveProperty('user_id', user.id)
        expect(response.body.results[0]).toHaveProperty('choice', 'like')
      })
    })
  })
})
