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
    describe('bookmarkEntity and unbookmarkEntity', () => {
      it('can bookmark and unbookmark a topic', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        // Bookmark the topic
        const relation = await bookmarkEntity(user!, 'topic', { id: topicId }, 'follow')
        expect(relation).toBeDefined()
        expect(relation.subject_id).toBe(user!.id)
        expect(relation.object_id).toBe(topicId)

        // Check bookmark exists
        const bookmarks = await getBookmarksForEntity(user!, 'topic', { id: topicId })
        expect(bookmarks.follow).toBe(true)

        // Unbookmark the topic
        await unbookmarkEntity(user!, 'topic', { id: topicId }, 'follow')

        // Check bookmark is gone
        const bookmarksAfter = await getBookmarksForEntity(user!, 'topic', { id: topicId })
        expect(bookmarksAfter.follow).toBeUndefined()
      })

      it('can bookmark and unbookmark a post', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        const postId = await insertTestPost({
          createdById: user!.id,
          slug: `test-post-${random}`,
          title: `Test Post ${random}`,
          markdown: 'Test body',
        })
        // Bookmark the post
        const relation = await bookmarkEntity(user!, 'post', { id: postId }, 'save')
        expect(relation).toBeDefined()
        expect(relation.subject_id).toBe(user!.id)
        expect(relation.object_id).toBe(postId)

        // Check bookmark exists
        const bookmarks = await getBookmarksForEntity(user!, 'post', { id: postId })
        expect(bookmarks.save).toBe(true)

        // Unbookmark the post
        await unbookmarkEntity(user!, 'post', { id: postId }, 'save')

        // Check bookmark is gone
        const bookmarksAfter = await getBookmarksForEntity(user!, 'post', { id: postId })
        expect(bookmarksAfter.save).toBeUndefined()
      })

      it('throws error for invalid bookmark type', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        // Try to use a non-bookmark predicate
        await expect(
          bookmarkEntity(
            user!,
            'topic',
            { id: topicId },
            'related' as unknown as EntityRelationPredicateType,
          ),
        ).rejects.toThrow(/Invalid bookmark type/)
      })
    })

    describe('getBookmarksForEntities', () => {
      it('retrieves bookmarks for multiple topics', async () => {
        // Use a fresh user to avoid bloom filter backfill races from earlier tests
        const freshUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 15)
        const topicId1 = await insertTestTopic({
          name: `Test Topic 1 ${random}`,
          slug: `test-topic-1-${random}`,
          createdById: freshUser.id,
        })
        const topicId2 = await insertTestTopic({
          name: `Test Topic 2 ${random}`,
          slug: `test-topic-2-${random}`,
          createdById: freshUser.id,
        })
        // Bookmark first topic
        await bookmarkEntity(freshUser, 'topic', { id: topicId1 }, 'follow')

        // Get bookmarks for both topics
        const bookmarks = await getBookmarksForEntities(freshUser, 'topic', [
          { id: topicId1 },
          { id: topicId2 },
        ])

        expect(bookmarks[topicId1].follow).toBe(true)
        expect(bookmarks[topicId2]).toBeUndefined()
      })
    })

    describe('getUserBookmarkCounts', () => {
      it('returns bookmark counts for a user', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        // Bookmark the topic
        await bookmarkEntity(user!, 'topic', { id: topicId }, 'follow')

        const counts = await getUserBookmarkCounts(user!.id)

        expect(counts.bookmarks.topics.follow).toBeGreaterThanOrEqual(1)
      })
    })

    describe('getTopicBookmarkCounts', () => {
      it('returns bookmark counts for a topic', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        // Bookmark the topic
        await bookmarkEntity(user!, 'topic', { id: topicId }, 'follow')

        const counts = await getTopicBookmarkCounts(topicId)

        expect(counts.follow).toBeGreaterThanOrEqual(1)
      })
    })

    describe('getPostBookmarkCounts', () => {
      it('returns bookmark counts for a post', async () => {
        const random = Math.random().toString(36).slice(2, 15)
        await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user!.id,
        })
        const postId = await insertTestPost({
          createdById: user!.id,
          slug: `test-post-${random}`,
          title: `Test Post ${random}`,
          markdown: 'Test body',
        })
        // Bookmark the post
        await bookmarkEntity(user!, 'post', { id: postId }, 'save')

        const counts = await getPostBookmarkCounts(postId)

        expect(counts.save).toBeGreaterThanOrEqual(1)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getRssFeedBookmarkCounts)
  void (0 as unknown as typeof insertTestRssFeed)
})
