import { describe, it, expect, afterAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserWithAge,
  followTopic,
  followUser,
  insertTestTopic,
  createTestTopic,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'
import { getTopicTypeSlug } from '@voucha/types/entities/topic'
import { onceElectionVoteStatsCompleted } from '@workers/elections/test-support'

describe('topic', () => {
  afterAll(async () => {}, 30000) // Increased timeout for cleanup when Playwright test data exists

  describe('Topic Individual Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug/follow-context', () => {
      it('returns only followed-user vote and follower context', async () => {
        const viewer = await createTestUser()
        const followedUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const unfollowedUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const topic = await createTestTopic({
          user: viewer!,
          name: `Follow Context Topic ${Date.now()}`,
          topic_type: 'topic',
        })
        const topicDetailResponse = await createRequest()
          .get(`/api/v1/topics/${topic.id}`)
          .expect(200)
        const electionId = topicDetailResponse.body.topic.id as string

        await followUser(viewer!, followedUser!)
        await followTopic(followedUser!, topic)
        await followTopic(unfollowedUser!, topic)

        const followedRequest = createRequest()
        await followedRequest.authenticateAs(followedUser!)
        await followedRequest
          .put(`/api/v1/topics/${electionId}/vote`)
          .send({ choice: 'like' })
          .expect(204)

        const unfollowedRequest = createRequest()
        await unfollowedRequest.authenticateAs(unfollowedUser!)
        await unfollowedRequest
          .put(`/api/v1/topics/${electionId}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)

        const request = createRequest()
        await request.authenticateAs(viewer!)
        const response = await request.get(`/api/v1/topics/${topic.id}/follow-context`).expect(200)

        expect(response.body.positive_by_following.total).toBe(1)
        expect(response.body.positive_by_following.users).toHaveLength(1)
        expect(response.body.positive_by_following.users[0].id).toBe(followedUser!.id)
        expect(response.body.negative_by_following.total).toBe(0)
        expect(response.body.negative_by_following.users).toHaveLength(0)
        expect(response.body.following_topic_followers.total).toBe(1)
        expect(response.body.following_topic_followers.users).toHaveLength(1)
        expect(response.body.following_topic_followers.users[0].id).toBe(followedUser!.id)
      })

      it('excludes users with topic_follows_visibility nobody from follow-context', async () => {
        const viewer = await createTestUser()
        const privateFollower = await createTestUser()
        const topic = await createTestTopic({
          user: viewer,
          name: `FC Privacy Nobody ${Math.random().toString(36).slice(2, 8)}`,
          topic_type: 'topic',
        })

        await followUser(viewer, privateFollower)
        await followTopic(privateFollower, topic)
        await updateUserFields(privateFollower.id, { topic_follows_visibility: 'nobody' })

        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/topics/${topic.id}/follow-context`).expect(200)

        expect(response.body.following_topic_followers.total).toBe(0)
        expect(response.body.following_topic_followers.users).toHaveLength(0)
      })

      it('excludes non-mutual follows when topic_follows_visibility is mutual_followers', async () => {
        const viewer = await createTestUser()
        const followedUser = await createTestUser()
        const topic = await createTestTopic({
          user: viewer,
          name: `FC Privacy Mutual Exclude ${Math.random().toString(36).slice(2, 8)}`,
          topic_type: 'topic',
        })

        // viewer follows followedUser but followedUser does NOT follow viewer back
        await followUser(viewer, followedUser)
        await followTopic(followedUser, topic)
        await updateUserFields(followedUser.id, { topic_follows_visibility: 'mutual_followers' })

        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/topics/${topic.id}/follow-context`).expect(200)

        expect(response.body.following_topic_followers.total).toBe(0)
        expect(response.body.following_topic_followers.users).toHaveLength(0)
      })

      it('includes mutual follows when topic_follows_visibility is mutual_followers', async () => {
        const viewer = await createTestUser()
        const mutualFollower = await createTestUser()
        const topic = await createTestTopic({
          user: viewer,
          name: `FC Privacy Mutual Include ${Math.random().toString(36).slice(2, 8)}`,
          topic_type: 'topic',
        })

        // Mutual follow: viewer follows mutualFollower AND mutualFollower follows viewer
        await followUser(viewer, mutualFollower)
        await followUser(mutualFollower, viewer)
        await followTopic(mutualFollower, topic)
        await updateUserFields(mutualFollower.id, { topic_follows_visibility: 'mutual_followers' })

        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/topics/${topic.id}/follow-context`).expect(200)

        expect(response.body.following_topic_followers.total).toBe(1)
        expect(response.body.following_topic_followers.users).toHaveLength(1)
        expect(response.body.following_topic_followers.users[0].id).toBe(mutualFollower.id)
      })

      it('admin bypasses topic_follows_visibility restrictions', async () => {
        const admin = await createTestUser({ administrator: true })
        const privateFollower = await createTestUser()
        const topic = await createTestTopic({
          user: admin,
          name: `FC Privacy Admin Bypass ${Math.random().toString(36).slice(2, 8)}`,
          topic_type: 'topic',
        })

        await followUser(admin, privateFollower)
        await followTopic(privateFollower, topic)
        await updateUserFields(privateFollower.id, { topic_follows_visibility: 'nobody' })

        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get(`/api/v1/topics/${topic.id}/follow-context`).expect(200)

        expect(response.body.following_topic_followers.total).toBe(1)
        expect(response.body.following_topic_followers.users).toHaveLength(1)
        expect(response.body.following_topic_followers.users[0].id).toBe(privateFollower.id)
      })
    })

    describe('rss_feed topic type', () => {
      it('should create and fetch a topic with rss_feed type', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test RSS Feed ${random}`,
          slug: `test-rss-feed-${random}`,
          createdById: user!.id,
          topicType: 'rss_feed',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/topics/${topicId}`).expect(200)

        expect(response.body.topic.id).toBe(topicId)
        expect(response.body.topic.topic_type).toBe('rss_feed')
      })

      it('rss_feed topic type maps to source URL slug', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Source ${random}`,
          slug: `test-source-${random}`,
          createdById: user!.id,
          topicType: 'rss_feed',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/topics/${topicId}`).expect(200)

        expect(response.body.topic.topic_type).toBe('rss_feed')
        expect(getTopicTypeSlug('rss_feed')).toBe('source')
      })
    })

    describe('topic election downvote visibility', () => {
      it('returns real votes_count_down for free users on topic elections', async () => {
        const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const freeUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Topic Downvote Vis ${random}`,
          slug: `topic-downvote-vis-${random}`,
          createdById: voter.id,
        })

        const voteRequest = createRequest()
        await voteRequest.authenticateAs(voter)
        await voteRequest
          .put(`/api/v1/topics/${topicId}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)
        await onceElectionVoteStatsCompleted(topicId)

        // Free user should see the real downvote count (not sanitized to 0)
        const freeRequest = createRequest()
        await freeRequest.authenticateAs(freeUser)
        const response = await freeRequest.get(`/api/v1/topics/${topicId}`).expect(200)

        expect(response.body.topic_election).toBeDefined()
        expect(response.body.topic_election.votes_count_down).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
