/**
 * Tests for topic ratings update with read-replica pattern
 */
import {
  createTestUser,
  insertTestTopic,
  insertTestReview,
  getTopicRatingStats,
  getTopicRatingsUpdatedAt,
  insertTopicElectionVote,
  archivePostForTopHashtagTest,
  setTestTopicRatingsUpdatedAt,
} from '@voucha/test-helpers'
import { updateTopicRatingStats } from './ratings.mts'
import { afterEach, describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { getTopicByAny } from './get.mts'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic'

describe('ratings.generated', () => {
  afterEach(async () => {})

  describe('updateTopicRatingStats', () => {
    it('calculates correct stats for topic with multiple reviews (one per user, DISTINCT ON latest)', async () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()
      const uuid3 = randomUUID()
      const user1 = await createTestUser({ username: `test-user-${uuid1}` })
      const user2 = await createTestUser({ username: `test-user-${uuid2}` })
      const topicId = await insertTestTopic({
        name: `Test Topic ${uuid3}`,
        slug: `test-topic-${uuid3}`,
        createdById: user1!.id,
      })

      // Each user creates one review each; DISTINCT ON picks latest per user
      await insertTestReview({
        userId: user1!.id,
        topicRatings: [{ topicId, rating: 4 }],
      })
      await insertTestReview({
        userId: user2!.id,
        topicRatings: [{ topicId, rating: 1 }],
      })

      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toBeTruthy()
      expect(stats!.ratings__count__4).toBe(1)
      expect(stats!.ratings__count__1).toBe(1)
      expect(stats!.ratings__count__5).toBe(0)
      expect(stats!.ratings__count__3).toBe(0)
      expect(stats!.ratings__count__2).toBe(0)

      // Check scores (vote_weight defaults to 1 for test users)
      expect(stats!.ratings__score__4).toBe(1)
      expect(stats!.ratings__score__1).toBe(1)
      expect(stats!.ratings__score__5).toBe(0)
    })

    it('DISTINCT ON uses latest review when user reviews same topic multiple times', async () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()
      const uuid3 = randomUUID()
      const user1 = await createTestUser({ username: `test-user-${uuid1}` })
      const user2 = await createTestUser({ username: `test-user-${uuid2}` })
      const topicId = await insertTestTopic({
        name: `Test Topic ${uuid3}`,
        slug: `test-topic-${uuid3}`,
        createdById: user1!.id,
      })

      // user1 reviews twice: first 5-star, then 4-star (latest)
      // user2 reviews twice: first 5-star, then 1-star (latest)
      await insertTestReview({ userId: user1!.id, topicRatings: [{ topicId, rating: 5 }] })
      await insertTestReview({ userId: user2!.id, topicRatings: [{ topicId, rating: 5 }] })
      await insertTestReview({ userId: user1!.id, topicRatings: [{ topicId, rating: 4 }] })
      await insertTestReview({ userId: user2!.id, topicRatings: [{ topicId, rating: 1 }] })

      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toBeTruthy()
      // Only latest per user counts: user1→4, user2→1
      expect(stats!.ratings__count__5).toBe(0)
      expect(stats!.ratings__count__4).toBe(1)
      expect(stats!.ratings__count__1).toBe(1)
    })

    it('returns zero stats for topic with no reviews', async () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()
      const user = await createTestUser({ username: `test-user-${uuid1}` })
      const topicId = await insertTestTopic({
        name: `Test Topic ${uuid2}`,
        slug: `test-topic-${uuid2}`,
        createdById: user!.id,
      })

      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toBeTruthy()
      expect(stats!.ratings__count__1).toBe(0)
      expect(stats!.ratings__count__2).toBe(0)
      expect(stats!.ratings__count__3).toBe(0)
      expect(stats!.ratings__count__4).toBe(0)
      expect(stats!.ratings__count__5).toBe(0)
      expect(stats!.ratings__score__1).toBe(0)
      expect(stats!.ratings__score__2).toBe(0)
      expect(stats!.ratings__score__3).toBe(0)
      expect(stats!.ratings__score__4).toBe(0)
      expect(stats!.ratings__score__5).toBe(0)
    })

    it('excludes archived reviews from public rating aggregates', async () => {
      const random = randomUUID()
      const user = await createTestUser({ username: `archived-rating-${random}` })
      const topicId = await insertTestTopic({
        name: `Archived Rating ${random}`,
        slug: `archived-rating-${random}`,
        createdById: user!.id,
      })
      const reviewId = await insertTestReview({
        userId: user!.id,
        topicRatings: [{ topicId, rating: 5 }],
      })
      await archivePostForTopHashtagTest(reviewId, user!.id)

      await updateTopicRatingStats(topicId)

      await expect(getTopicRatingStats(topicId)).resolves.toMatchObject({
        ratings__count__5: 0,
        ratings__score__5: 0,
      })
    })

    it('skips write when ratings unchanged', async () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()
      const user = await createTestUser({ username: `test-user-${uuid1}` })
      const topicId = await insertTestTopic({
        name: `Test Topic ${uuid2}`,
        slug: `test-topic-${uuid2}`,
        createdById: user!.id,
      })

      await insertTestReview({ userId: user!.id, topicRatings: [{ topicId, rating: 5 }] })
      await updateTopicRatingStats(topicId)

      const sentinel = new Date('2000-01-01T00:00:00.000Z')
      await setTestTopicRatingsUpdatedAt(topicId, sentinel)

      // Call update again without changing reviews
      await updateTopicRatingStats(topicId)

      // A rewrite cannot pass by sharing the same clock millisecond as the initial write.
      const secondTimestamp = await getTopicRatingsUpdatedAt(topicId)
      expect(secondTimestamp).toEqual(sentinel)
    })

    it('writes when ratings change', async () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()
      const uuid3 = randomUUID()
      const user1 = await createTestUser({ username: `test-user-${uuid1}` })
      const user2 = await createTestUser({ username: `test-user-${uuid2}` })
      const topicId = await insertTestTopic({
        name: `Test Topic ${uuid3}`,
        slug: `test-topic-${uuid3}`,
        createdById: user1!.id,
      })

      await insertTestReview({ userId: user1!.id, topicRatings: [{ topicId, rating: 5 }] })
      await updateTopicRatingStats(topicId)

      const sentinel = new Date('2000-01-01T00:00:00.000Z')
      await setTestTopicRatingsUpdatedAt(topicId, sentinel)
      const firstStats = await getTopicRatingStats(topicId)
      expect(firstStats).toBeTruthy()
      expect(firstStats!.ratings__count__5).toBe(1)

      // New user adds a different review
      await insertTestReview({ userId: user2!.id, topicRatings: [{ topicId, rating: 4 }] })
      await updateTopicRatingStats(topicId)

      // A changed aggregate must overwrite the sentinel, independently of clock resolution.
      const secondTimestamp = await getTopicRatingsUpdatedAt(topicId)
      expect(secondTimestamp).not.toEqual(sentinel)

      // Stats should be updated
      const secondStats = await getTopicRatingStats(topicId)
      expect(secondStats).toBeTruthy()
      expect(secondStats!.ratings__count__5).toBe(1)
      expect(secondStats!.ratings__count__4).toBe(1)
    })

    it('works correctly for first-time insert', async () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()
      const user = await createTestUser({ username: `test-user-${uuid1}` })
      const topicId = await insertTestTopic({
        name: `Test Topic ${uuid2}`,
        slug: `test-topic-${uuid2}`,
        createdById: user!.id,
      })

      // Don't pre-populate topic_metrics, let the function handle it
      await insertTestReview({ userId: user!.id, topicRatings: [{ topicId, rating: 3 }] })
      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toBeTruthy()
      expect(stats!.ratings__count__3).toBe(1)
      expect(stats!.ratings__score__3).toBe(1)

      const timestamp = await getTopicRatingsUpdatedAt(topicId)
      expect(timestamp).toBeTruthy()
    })

    it('adds vote-only users to score buckets without changing review counts', async () => {
      const random = randomUUID()
      const reviewer = await createTestUser({ username: `reviewer-${random}` })
      const voter = await createTestUser({ username: `voter-${random}` })
      const topicId = await insertTestTopic({
        name: `Vote Only Topic ${random}`,
        slug: `vote-only-topic-${random}`,
        createdById: reviewer!.id,
      })

      await insertTestReview({ userId: reviewer!.id, topicRatings: [{ topicId, rating: 5 }] })
      const topic = await getTopicByAny(topicId)
      await upsertTopicElectionVotes(voter!.id, [{ entityId: topic!.id, score: 1 }])

      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toBeTruthy()
      expect(stats!.ratings__count__5).toBe(1)
      expect(stats!.ratings__count__4).toBe(0)
      expect(stats!.ratings__score__5).toBe(1)
      expect(stats!.ratings__score__4).toBe(1)
    })

    it('excludes legacy Clear zero votes while retaining explicit Neutral votes', async () => {
      const random = randomUUID()
      const creator = await createTestUser({ username: `rating-zero-creator-${random}` })
      const legacyVoter = await createTestUser({ username: `rating-zero-legacy-${random}` })
      const neutralVoter = await createTestUser({ username: `rating-zero-neutral-${random}` })
      const topicId = await insertTestTopic({
        name: `Rating zero provenance ${random}`,
        slug: `rating-zero-provenance-${random}`,
        createdById: creator!.id,
      })

      await insertTopicElectionVote(legacyVoter!.id, topicId, 0)
      await insertTopicElectionVote(neutralVoter!.id, topicId, 0, undefined, true)
      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toMatchObject({
        ratings__score__3: 1,
        ratings__count__3: 0,
      })
    })

    it('non-neutral reviews take precedence over topic votes', async () => {
      const random = randomUUID()
      const user = await createTestUser({ username: `precedence-user-${random}` })
      const topicId = await insertTestTopic({
        name: `Precedence Topic ${random}`,
        slug: `precedence-topic-${random}`,
        createdById: user!.id,
      })

      await insertTestReview({ userId: user!.id, topicRatings: [{ topicId, rating: 5 }] })
      const topic = await getTopicByAny(topicId)
      await upsertTopicElectionVotes(user!.id, [{ entityId: topic!.id, score: -1 }])

      await updateTopicRatingStats(topicId)

      const stats = await getTopicRatingStats(topicId)
      expect(stats).toBeTruthy()
      expect(stats!.ratings__count__5).toBe(1)
      expect(stats!.ratings__score__5).toBe(1)
      expect(stats!.ratings__score__2).toBe(0)
    })
  })
})
