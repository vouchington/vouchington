import { onceElectionVoteStatsCompleted } from '@workers/elections/test-support'
import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestPost,
  createTestUser,
  createTestUserWithAge,
  followUser,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'

describe('post', () => {
  describe('Post Individual Routes', () => {
    let admin: PrivateUser

    let creator: PrivateUser

    let viewer: PrivateUser

    beforeAll(async () => {
      admin = await createTestUser({ administrator: true })
      creator = await createTestUser()
      viewer = await createTestUser()
      await followUser(viewer, creator)
    })

    describe('post election downvote sanitization', () => {
      it('sanitizes votes_count_down to 0 for free users on post elections', async () => {
        const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const random = Math.random().toString(36).slice(2, 8)
        const postId = await insertTestPost({
          title: `Post Downvote Sanitized ${random}`,
          slug: `post-downvote-sanitized-${random}`,
          createdById: creator.id,
          markdown: 'Post downvote sanitization markdown',
        })

        const voteRequest = createRequest()
        await voteRequest.authenticateAs(voter)
        await voteRequest
          .put(`/api/v1/posts/${postId}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)
        await onceElectionVoteStatsCompleted(postId)

        // Free user (viewer has no membership_plan) should see votes_count_down = 0
        const freeRequest = createRequest()
        await freeRequest.authenticateAs(viewer)
        const response = await freeRequest.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post_election).toBeDefined()
        expect(response.body.post_election.votes_count_up).toBe(0)
        expect(response.body.post_election.votes_count_down).toBe(0)
        expect(response.body.post_election.votes_score_net).toBe(-1)
      })

      it('shows real votes_count_down for admin users on post elections', async () => {
        const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const random = Math.random().toString(36).slice(2, 8)
        const postId = await insertTestPost({
          title: `Post Downvote Admin Visible ${random}`,
          slug: `post-downvote-admin-visible-${random}`,
          createdById: creator.id,
          markdown: 'Post downvote admin visibility markdown',
        })

        const voteRequest = createRequest()
        await voteRequest.authenticateAs(voter)
        await voteRequest
          .put(`/api/v1/posts/${postId}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)
        await onceElectionVoteStatsCompleted(postId)

        // Admin should see real downvote counts
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin)
        const response = await adminRequest.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post_election).toBeDefined()
        expect(response.body.post_election.votes_count_up).toBe(0)
        expect(response.body.post_election.votes_count_down).toBe(1)
        expect(response.body.post_election.votes_score_net).toBe(-1)
      })
    })

    describe('removed routes', () => {
      it('returns 404 for GET /api/v1/posts/:idOrSlug/metrics', async () => {
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: `test-post-metrics-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.get(`/api/v1/posts/${postId}/metrics`).expect(404)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof onceEntityListenerCompleted)
  void (0 as unknown as typeof getMinUUIDv7ForDate)
})
