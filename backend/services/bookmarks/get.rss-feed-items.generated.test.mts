import { it, expect, beforeAll, describe } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from './upsert.mts'
import { getBookmarksForEntity, getBookmarksForEntities } from './get.mts'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('get.rss-feed-items.generated', () => {
  let user: PrivateUser
  let sharedRssFeedId: string

  beforeAll(async () => {
    user = await createTestUser()
    const topic = await createTestTopic()
    sharedRssFeedId = await createTestRssFeedWithTiming(topic.id)
  })

  describe('RSS Feed Item Bookmarks (UUID Keys)', () => {
    it('can save and unsave an RSS feed item with UUID id', async () => {
      const item = await createTestRssFeedItemWithUrl(sharedRssFeedId)

      // Save the RSS feed item
      const relation = await bookmarkEntity(user, 'rss_feed_item', { id: item.id }, 'save')
      expect(relation).toBeDefined()
      expect(relation.subject_id).toBe(user.id)

      // Check save exists
      const bookmarks = await getBookmarksForEntity(user, 'rss_feed_item', { id: item.id })
      expect(bookmarks.save).toBe(true)

      // Unsave the RSS feed item
      await unbookmarkEntity(user, 'rss_feed_item', { id: item.id }, 'save')

      // Check save is gone
      const bookmarksAfter = await getBookmarksForEntity(user, 'rss_feed_item', { id: item.id })
      expect(bookmarksAfter.save).toBeUndefined()
    })

    it('can hide and unhide an RSS feed item', async () => {
      const item = await createTestRssFeedItemWithUrl(sharedRssFeedId)

      // Hide the RSS feed item
      const relation = await bookmarkEntity(user, 'rss_feed_item', { id: item.id }, 'hide')
      expect(relation).toBeDefined()
      expect(relation.subject_id).toBe(user.id)

      // Check hide exists
      const bookmarks = await getBookmarksForEntity(user, 'rss_feed_item', { id: item.id })
      expect(bookmarks.hide).toBe(true)

      // Unhide the RSS feed item
      await unbookmarkEntity(user, 'rss_feed_item', { id: item.id }, 'hide')

      // Check hide is gone
      const bookmarksAfter = await getBookmarksForEntity(user, 'rss_feed_item', { id: item.id })
      expect(bookmarksAfter.hide).toBeUndefined()
    })

    it('retrieves bookmarks for multiple RSS feed items', async () => {
      const [item1, item2] = await Promise.all([
        createTestRssFeedItemWithUrl(sharedRssFeedId),
        createTestRssFeedItemWithUrl(sharedRssFeedId),
      ])

      // Save first RSS feed item
      await bookmarkEntity(user, 'rss_feed_item', { id: item1.id }, 'save')

      // Get bookmarks for both RSS feed items using UUID ids
      const bookmarks = await getBookmarksForEntities(user, 'rss_feed_item', [item1.id, item2.id])

      expect(bookmarks[item1.id].save).toBe(true)
      expect(bookmarks[item2.id]).toBeUndefined()
    })

    it('handles empty entities array without hanging', async () => {
      const bookmarks = await getBookmarksForEntities(user, 'rss_feed_item', [])

      expect(bookmarks).toEqual({})
    })

    it('handles mix of bookmarked and unbookmarked RSS feed items', async () => {
      const [item1, item2] = await Promise.all([
        createTestRssFeedItemWithUrl(sharedRssFeedId),
        createTestRssFeedItemWithUrl(sharedRssFeedId),
      ])

      // Save both items
      await Promise.all([
        bookmarkEntity(user, 'rss_feed_item', { id: item1.id }, 'save'),
        bookmarkEntity(user, 'rss_feed_item', { id: item2.id }, 'save'),
      ])

      // Get bookmarks using UUID ids
      const bookmarks = await getBookmarksForEntities(user, 'rss_feed_item', [item1.id, item2.id])

      expect(bookmarks[item1.id].save).toBe(true)
      expect(bookmarks[item2.id].save).toBe(true)
    })

    it('handles large batch of RSS feed items efficiently', async () => {
      // Create 10 RSS feed items in parallel
      const items = await Promise.all(
        Array.from({ length: 10 }, () => createTestRssFeedItemWithUrl(sharedRssFeedId)),
      )

      // Save first 5 items
      await Promise.all(
        items
          .slice(0, 5)
          .map(item => bookmarkEntity(user, 'rss_feed_item', { id: item.id }, 'save')),
      )

      // Get bookmarks for all 10 items at once
      const itemIds = items.map(item => item.id)
      const bookmarks = await getBookmarksForEntities(user, 'rss_feed_item', itemIds)

      // Verify first 5 are saved
      for (let i = 0; i < 5; i++) {
        expect(bookmarks[itemIds[i]].save).toBe(true)
      }

      // Verify last 5 are not saved
      for (let i = 5; i < 10; i++) {
        expect(bookmarks[itemIds[i]]).toBeUndefined()
      }
    })
  })
})
