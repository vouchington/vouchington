import { it, expect, beforeAll, describe } from 'vitest'

import { bookmarkEntity, unbookmarkEntity } from '../upsert.mts'

import { getBookmarksForEntity, getBookmarksForEntities } from '../get.mts'

import {
  getUserBookmarkCounts,
  getTopicBookmarkCounts,
  getPostBookmarkCounts,
  getRssFeedBookmarkCounts,
} from '../counts.mts'

import type { EntityRelationPredicateType } from '@services/entity-relations/config'

import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestRssFeed,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@voucha/types/entities/user'

describe('index', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  describe('Bookmarks service', () => {
    describe('RSS Feed bookmarks', () => {
      it('can follow and unfollow an RSS feed', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        const rssFeedId = await insertTestRssFeed({
          topicId,
          title: `Test RSS Feed ${random}`,
        })
        // Follow the RSS feed
        const relation = await bookmarkEntity(user!, 'rss_feed', { id: rssFeedId }, 'follow')
        expect(relation).toBeDefined()
        expect(relation.subject_id).toBe(user!.id)
        expect(relation.object_id).toBe(rssFeedId)

        // Check follow exists
        const bookmarks = await getBookmarksForEntity(user!, 'rss_feed', { id: rssFeedId })
        expect(bookmarks.follow).toBe(true)

        // Unfollow the RSS feed
        await unbookmarkEntity(user!, 'rss_feed', { id: rssFeedId }, 'follow')

        // Check follow is gone
        const bookmarksAfter = await getBookmarksForEntity(user!, 'rss_feed', { id: rssFeedId })
        expect(bookmarksAfter.follow).toBeUndefined()
      })

      it('can mute and unmute an RSS feed', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        const rssFeedId = await insertTestRssFeed({
          topicId,
          title: `Test RSS Feed ${random}`,
        })
        // Mute the RSS feed
        const relation = await bookmarkEntity(user!, 'rss_feed', { id: rssFeedId }, 'mute')
        expect(relation).toBeDefined()
        expect(relation.subject_id).toBe(user!.id)
        expect(relation.object_id).toBe(rssFeedId)

        // Check mute exists
        const bookmarks = await getBookmarksForEntity(user!, 'rss_feed', { id: rssFeedId })
        expect(bookmarks.mute).toBe(true)

        // Unmute the RSS feed
        await unbookmarkEntity(user!, 'rss_feed', { id: rssFeedId }, 'mute')

        // Check mute is gone
        const bookmarksAfter = await getBookmarksForEntity(user!, 'rss_feed', { id: rssFeedId })
        expect(bookmarksAfter.mute).toBeUndefined()
      })

      it('retrieves bookmarks for multiple RSS feeds', async () => {
        // Use a fresh user to avoid bloom filter backfill races from earlier tests
        const freshUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 15)
        const topicId1 = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-1-${random}`,
          createdById: freshUser.id,
        })
        const topicId2 = await insertTestTopic({
          name: `Test Topic Second ${random}`,
          slug: `test-topic-2-${random}`,
          createdById: freshUser.id,
        })
        const rssFeedId1 = await insertTestRssFeed({
          topicId: topicId1,
          title: `Test RSS Feed 1 ${random}`,
        })
        const rssFeedId2 = await insertTestRssFeed({
          topicId: topicId2,
          title: `Test RSS Feed 2 ${random}`,
        })
        // Follow first RSS feed
        await bookmarkEntity(freshUser, 'rss_feed', { id: rssFeedId1 }, 'follow')

        // Get bookmarks for both RSS feeds
        const bookmarks = await getBookmarksForEntities(freshUser, 'rss_feed', [
          { id: rssFeedId1 },
          { id: rssFeedId2 },
        ])

        expect(bookmarks[rssFeedId1].follow).toBe(true)
        expect(bookmarks[rssFeedId2]).toBeUndefined()
      })

      it('returns bookmark counts for an RSS feed', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        const rssFeedId = await insertTestRssFeed({
          topicId,
          title: `Test RSS Feed ${random}`,
        })
        // Follow the RSS feed
        await bookmarkEntity(user!, 'rss_feed', { id: rssFeedId }, 'follow')

        const counts = await getRssFeedBookmarkCounts(rssFeedId)

        expect(counts.follow).toBeGreaterThanOrEqual(1)
      })

      it('getUserBookmarkCounts includes RSS feed follows', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        const rssFeedId = await insertTestRssFeed({
          topicId,
          title: `Test RSS Feed ${random}`,
        })
        // Follow the RSS feed
        await bookmarkEntity(user!, 'rss_feed', { id: rssFeedId }, 'follow')

        const counts = await getUserBookmarkCounts(user!.id)

        expect(counts.bookmarks.rss_feeds?.follow).toBeGreaterThanOrEqual(1)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  const keepEntityRelationPredicateType: EntityRelationPredicateType | null = null
  void (0 as unknown as typeof keepEntityRelationPredicateType)
  void (0 as unknown as typeof getTopicBookmarkCounts)
  void (0 as unknown as typeof getPostBookmarkCounts)
  void (0 as unknown as typeof insertTestPost)
})
