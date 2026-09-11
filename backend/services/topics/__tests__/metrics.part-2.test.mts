import { it, expect, describe, beforeAll } from 'vitest'

import { getTopicMetricsByAny, getTopicViewerCounts } from '../metrics.mts'

import {
  createTestUser,
  followUser,
  insertTestTopic,
  insertTestReview,
  createTestPost,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  addCategoryToRssFeedItem,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertScoredPostTopicCategoryRelation,
  mergeTopicForTest,
  setScoredPostTopicCategoryRelationScore,
  archivePostForTopHashtagTest,
} from '@voucha/test-helpers'
import { updateTopicRatingStats } from '../ratings.mts'

import type { PrivateUser } from '@services/users/types'

describe('metrics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('getTopicViewerCounts', () => {
    it('counts public broadcast=everyone posts for any logged-in user', async () => {
      const topic = await createTestTopic({
        user: user,
        name: `Viewer Counts ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const post = await createTestPost({
        user: user,
        title: `Public Discussion ${Date.now()}`,
        post_type: 'discussion',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, user.id)

      const viewer = await createTestUser()
      const counts = await getTopicViewerCounts(viewer, topic.id)

      expect(counts.discussions).toBe(1)
      expect(counts.reviews).toBe(0)
      expect(counts['data-points']).toBe(0)

      await setScoredPostTopicCategoryRelationScore(post.id, topic.id, 0)
      await expect(getTopicViewerCounts(viewer, topic.id)).resolves.toMatchObject({
        discussions: 0,
      })
    })

    it('counts broadcast=users posts for logged-in users', async () => {
      const topic = await createTestTopic({
        user: user,
        name: `Users Broadcast ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const post = await createTestPost({
        user: user,
        title: `Users Only ${Date.now()}`,
        post_type: 'discussion',
        broadcast: 'users',
        privacy: 'private',
      })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, user.id)

      const viewer = await createTestUser()
      const counts = await getTopicViewerCounts(viewer, topic.id)

      expect(counts.discussions).toBe(1)
    })

    it('excludes broadcast=followers posts when viewer does not follow author', async () => {
      const author = await createTestUser()
      const topic = await createTestTopic({
        user: user,
        name: `Followers Only ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const post = await createTestPost({
        user: author,
        title: `Followers ${Date.now()}`,
        post_type: 'discussion',
        broadcast: 'followers',
        privacy: 'private',
      })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, author.id)

      const nonFollower = await createTestUser()
      const counts = await getTopicViewerCounts(nonFollower, topic.id)

      expect(counts.discussions).toBe(0)
    })

    it('includes broadcast=followers posts when viewer follows author', async () => {
      const author = await createTestUser()
      const topic = await createTestTopic({
        user: user,
        name: `Follower Visible ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const post = await createTestPost({
        user: author,
        title: `Follower Post ${Date.now()}`,
        post_type: 'discussion',
        broadcast: 'followers',
        privacy: 'private',
      })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, author.id)

      const follower = await createTestUser()
      await followUser(follower, author)

      const counts = await getTopicViewerCounts(follower, topic.id)

      expect(counts.discussions).toBe(1)
    })

    it('creator always sees own posts regardless of broadcast', async () => {
      const author = await createTestUser()
      const topic = await createTestTopic({
        user: user,
        name: `Creator Visible ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const post = await createTestPost({
        user: author,
        title: `Private ${Date.now()}`,
        post_type: 'discussion',
        broadcast: 'followers',
        privacy: 'private',
      })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, author.id)

      const counts = await getTopicViewerCounts(author, topic.id)

      expect(counts.discussions).toBe(1)
    })

    it('excludes archived posts from viewer counts', async () => {
      const topic = await createTestTopic({
        user,
        name: `Archived Viewer Count ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      const post = await createTestPost({
        user,
        post_type: 'discussion',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, user.id)
      await archivePostForTopHashtagTest(post.id, user.id)

      await expect(getTopicViewerCounts(user, topic.id)).resolves.toMatchObject({
        discussions: 0,
      })
    })
  })
  describe('getTopicMetricsByAny', () => {
    it('fetches metrics by id', async () => {
      const topic = await createTestTopic({
        user: user,
        name: `Metrics By Id ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const metrics = await getTopicMetricsByAny(topic.id)

      expect(metrics?.id).toBe(topic.id)
    })

    it('fetches metrics by slug', async () => {
      const topic = await createTestTopic({
        user: user,
        name: `Metrics By Slug ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })

      const metrics = await getTopicMetricsByAny(topic.slug)

      expect(metrics?.id).toBe(topic.id)
    })

    it('counts public posts categorized only through a linked hashtag alias', async () => {
      const topic = await createTestTopic({
        user,
        name: `Metrics Alias Counts ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      const post = await createTestPost({
        user,
        title: `Metrics Alias Discussion ${Date.now()}`,
        post_type: 'discussion',
        broadcast: 'everyone',
        privacy: 'public',
      })
      const aliasId = await createTopHashtagAliasForTest(topic.id, `metrics-alias-${post.id}`)
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: aliasId,
        userId: user.id,
        authoredToken: '#metrics-alias',
      })

      const metrics = await getTopicMetricsByAny(topic.id)

      expect(metrics?.count.discussions).toBe(1)
    })

    it('returns null for a non-existent slug', async () => {
      const metrics = await getTopicMetricsByAny(`nonexistent-${Date.now()}`)

      expect(metrics).toBeNull()
    })

    it('resolves to the destination topic metrics when queried by a merged source id', async () => {
      const source = await createTestTopic({
        user: user,
        name: `Merge Source Id ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      const destination = await createTestTopic({
        user: user,
        name: `Merge Destination Id ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      await mergeTopicForTest(source.id, destination.id, user.id)

      const metrics = await getTopicMetricsByAny(source.id)

      expect(metrics?.id).toBe(destination.id)
    })

    it('resolves to the destination topic metrics when queried by a merged source slug', async () => {
      const source = await createTestTopic({
        user: user,
        name: `Merge Source Slug ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      const destination = await createTestTopic({
        user: user,
        name: `Merge Destination Slug ${Math.random().toString(36).slice(2, 8)}`,
        topic_type: 'topic',
      })
      await mergeTopicForTest(source.id, destination.id, user.id)

      const metrics = await getTopicMetricsByAny(source.slug)

      expect(metrics?.id).toBe(destination.id)
    })
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestTopic)
  void (0 as unknown as typeof insertTestReview)
  void (0 as unknown as typeof createTestRssFeedWithTiming)
  void (0 as unknown as typeof createTestRssFeedItemWithUrl)
  void (0 as unknown as typeof addCategoryToRssFeedItem)
  void (0 as unknown as typeof updateTopicRatingStats)
})
