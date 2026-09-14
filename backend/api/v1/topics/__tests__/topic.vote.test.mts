import { describe, expect, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserWithAge,
  insertTestTopic,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getTopicByAny } from '@services/topics/get'

describe('topic.vote', () => {
  let user: PrivateUser
  let putTopicId: string
  let getTopicId: string

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    ;[putTopicId, getTopicId] = await Promise.all([
      insertTestTopic({
        name: `Topic Vote Put ${Date.now()}`,
        slug: `topic-vote-put-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: user.id,
      }),
      insertTestTopic({
        name: `Topic Vote Get ${Date.now()}`,
        slug: `topic-vote-get-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: user.id,
      }),
    ])
  })

  describe('Topic Vote Routes', () => {
    describe('PUT /api/v1/topics/:id/vote', () => {
      it('allows authenticated users to vote on a topic', async () => {
        const topic = await getTopicByAny(putTopicId)

        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/topics/${topic!.id}/vote`).send({ choice: 'like' }).expect(204)
      })
    })

    describe('GET /api/v1/topics/:id/votes', () => {
      it('returns the authenticated user vote for a topic', async () => {
        const topic = await getTopicByAny(getTopicId)

        const request = createRequest()
        await request.authenticateAs(user)

        await request
          .put(`/api/v1/topics/${topic!.id}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)

        const response = await request.get(`/api/v1/topics/${topic!.id}/votes`).expect(200)

        expect(response.body.results).toHaveLength(1)
        expect(response.body.results[0]).toMatchObject({
          entity_id: topic!.id,
          user_id: user.id,
          choice: 'dislike',
        })
      })
    })
  })
})
