import { it, expect, describe, beforeAll } from 'vitest'

import { getTopicMetricsByAny, getTopicViewerCounts } from '@services/topics/metrics'

import {
  createTestUser,
  followUser,
  insertTestTopic,
  insertTestReview,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  addCategoryToRssFeedItem,
  insertScoredPostTopicCategoryRelation,
} from '@voucha/test-helpers'
// Relocated from backend/services/topics/__tests__/metrics.test.mts: the data-point case below
// asserts on `post_data_point_topics`, which only the real createPost write path populates (the
// raw @voucha/test-helpers substitute does not). @services/topics must not depend on
// @services/posts (posts already prod-deps topics, the kept direction), so this test lives here.
import { createTestPost } from '../test-support.mts'
import { updateTopicRatingStats } from '@services/topics/ratings'

import type { PrivateUser } from '@services/users/types'

describe('metrics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('getTopicMetricsByAny', () => {
    it('retrieves metrics by UUID', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-${random}`,
        createdById: user.id,
      })
      const metrics = await getTopicMetricsByAny(topicId)

      expect(metrics).toBeDefined()
      expect(metrics).toMatchObject({
        __entity_type: 'topic_metrics',
        id: topicId,
        ratings: {
          count: {
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            '5': 0,
          },
        },
      })
      expect(metrics?.ratings__updated_at).toBeInstanceOf(Date)
    })

    it('retrieves metrics by slug', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const slug = `test-topic-${random}`
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug,
        createdById: user.id,
      })
      const metrics = await getTopicMetricsByAny(slug)

      expect(metrics).toBeDefined()
      expect(metrics).toMatchObject({
        __entity_type: 'topic_metrics',
        id: topicId,
        ratings: {
          count: {
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            '5': 0,
          },
        },
      })
    })

    it('retrieves metrics by slug (case insensitive)', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const slug = `test-topic-${random}`
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: slug.toLowerCase(),
        createdById: user.id,
      })
      const metrics = await getTopicMetricsByAny(slug.toUpperCase())

      expect(metrics).toBeDefined()
      expect(metrics?.id).toBe(topicId)
    })

    it('returns null for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'
      const metrics = await getTopicMetricsByAny(nonExistentId)

      expect(metrics).toBeNull()
    })

    it('returns null for non-existent slug', async () => {
      const nonExistentSlug = `non-existent-${Math.random().toString(36).slice(2, 15)}`
      const metrics = await getTopicMetricsByAny(nonExistentSlug)

      expect(metrics).toBeNull()
    })

    it('throws error for invalid identifier', async () => {
      await expect(getTopicMetricsByAny('invalid identifier!')).rejects.toThrow(
        /Invalid topic identifier/,
      )
    })

    it('includes rating counts when reviews exist', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-${random}`,
        createdById: user.id,
      })
      // Create reviews with different ratings (DISTINCT ON uses latest per user)
      // user gets rating 4 as their latest (most recent post by this user)
      await insertTestReview({
        userId: user.id,
        topicRatings: [{ topicId, rating: 4 }],
        title: 'Good',
      })
      // Update rating stats
      await updateTopicRatingStats(topicId)

      const metrics = await getTopicMetricsByAny(topicId)

      expect(metrics).toBeDefined()
      expect(metrics?.ratings.count).toMatchObject({
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 1,
        '5': 0,
      })
    })

    it('includes public counts for discussions, reviews, data points, and latest (source-owned RSS)', async () => {
      const topic = await createTestTopic({
        user: user,
        name: `Counts Topic ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'card',
      })

      const discussion = await createTestPost({
        user: user,
        title: `Discussion ${Date.now()}`,
        markdown: 'discussion body',
        post_type: 'discussion',
      })
      await insertScoredPostTopicCategoryRelation(discussion.id, topic.id, user.id)

      await createTestPost({
        user: user,
        title: `Data Point ${Date.now()}`,
        markdown: 'data point body',
        post_type: 'data_point',
        data_point_vertical: 'credit_card',
        structured_data: {
          vertical: 'credit_card',
          schema_version: 1,
          currency: 'usd',
          topic_ids: [topic.id],
          result: 'approved',
          credit_score_range: '670-739',
        },
      })

      await insertTestReview({
        userId: user.id,
        topicRatings: [{ topicId: topic.id, rating: 5 }],
        title: 'Counted review',
      })
      await updateTopicRatingStats(topic.id)

      const rssFeedId = await createTestRssFeedWithTiming(topic.id)
      await createTestRssFeedItemWithUrl(rssFeedId)

      const metrics = await getTopicMetricsByAny(topic.id)

      expect(metrics?.count).toEqual({
        discussions: 1,
        reviews: 1,
        'data-points': 1,
        news: 0,
        latest: 1,
      })
    })

    it('counts category-tagged RSS feed items as news', async () => {
      const topic = await createTestTopic({
        user: user,
        name: `News Category Topic ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'card',
      })

      // Create an RSS feed owned by a different topic (not this one)
      const otherTopic = await createTestTopic({
        user: user,
        name: `Other Topic ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      const rssFeedId = await createTestRssFeedWithTiming(otherTopic.id)
      const item = await createTestRssFeedItemWithUrl(rssFeedId)
      await addCategoryToRssFeedItem(item.id, topic.id)

      const metrics = await getTopicMetricsByAny(topic.id)

      expect(metrics?.count.news).toBe(1)
      expect(metrics?.count.latest).toBe(0)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getTopicViewerCounts)
  void (0 as unknown as typeof followUser)
})
