import { it, expect, describe, beforeAll } from 'vitest'
import { createTestTopic, createRandomString } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import {
  upsertRssFeedCategories,
  getRssFeedCategories,
  deleteRssFeedCategories,
  backfillCategoriesForTopicAlias,
} from '../categories.mts'

describe('rss-feed categories', () => {
  let rssFeedId: string

  beforeAll(async () => {
    const feed = await createTestRssFeed({})
    rssFeedId = feed.id
  }, 60_000)

  describe('upsertRssFeedCategories', () => {
    it('inserts normalized category rows for a feed', async () => {
      await upsertRssFeedCategories(rssFeedId, ['Business', 'News'])

      const rows = await getRssFeedCategories(rssFeedId)
      const texts = rows.map(r => r.category_text)
      expect(texts).toContain('business')
      expect(texts).toContain('news')
    }, 30_000)

    it('deduplicates categories (case-insensitive)', async () => {
      const feed = await createTestRssFeed({})
      await upsertRssFeedCategories(feed.id, ['Technology', 'technology', 'TECHNOLOGY'])
      const rows = await getRssFeedCategories(feed.id)
      const techRows = rows.filter(r => r.category_text === 'technology')
      expect(techRows).toHaveLength(1)
    }, 30_000)

    it('is idempotent on conflict — does not error on duplicate upsert', async () => {
      const feed = await createTestRssFeed({})
      await upsertRssFeedCategories(feed.id, ['Comedy'])
      // Re-upsert same categories — should not throw
      await expect(upsertRssFeedCategories(feed.id, ['Comedy'])).resolves.not.toThrow()
    }, 30_000)

    it('updates topic_id on conflict when a matching topic is created after the initial upsert', async () => {
      const feed = await createTestRssFeed({})
      // First upsert: no matching topic yet — topic_id is null
      const uniqueCategory = `test-cat-${createRandomString(12)}`
      await upsertRssFeedCategories(feed.id, [uniqueCategory])
      const before = await getRssFeedCategories(feed.id)
      const beforeRow = before.find(r => r.category_text === uniqueCategory)
      expect(beforeRow?.topic_id).toBeNull()

      // Create a topic whose slug matches the normalized category text
      const topic = await createTestTopic({ slug: uniqueCategory, name: uniqueCategory })

      // Re-upsert: now a matching topic exists — topic_id should be filled in
      await upsertRssFeedCategories(feed.id, [uniqueCategory])
      const after = await getRssFeedCategories(feed.id)
      const afterRow = after.find(r => r.category_text === uniqueCategory)
      expect(afterRow?.topic_id).toBe(topic.id)
    }, 30_000)

    it('does nothing for empty input', async () => {
      const feed = await createTestRssFeed({})
      await expect(upsertRssFeedCategories(feed.id, [])).resolves.not.toThrow()
      const rows = await getRssFeedCategories(feed.id)
      expect(rows).toHaveLength(0)
    }, 30_000)

    it('handles nested Apple subcategory texts', async () => {
      const feed = await createTestRssFeed({})
      // extractFeedCategories would flatten these; here we pass the already-flattened list
      await upsertRssFeedCategories(feed.id, ['news', 'tech news'])
      const rows = await getRssFeedCategories(feed.id)
      const texts = rows.map(r => r.category_text)
      expect(texts).toContain('news')
      expect(texts).toContain('tech news')
    }, 30_000)

    it('removes categories dropped from the feed on the next upsert', async () => {
      const feed = await createTestRssFeed({})
      await upsertRssFeedCategories(feed.id, ['Sports', 'News', 'Comedy'])
      // Second crawl drops Sports and Comedy
      await upsertRssFeedCategories(feed.id, ['News'])
      const rows = await getRssFeedCategories(feed.id)
      const texts = rows.map(r => r.category_text)
      expect(texts).toEqual(['news'])
    }, 30_000)
  })

  describe('deleteRssFeedCategories', () => {
    it('removes all category rows for a feed', async () => {
      const feed = await createTestRssFeed({})
      await upsertRssFeedCategories(feed.id, ['Arts', 'Science'])
      await deleteRssFeedCategories(feed.id)
      const rows = await getRssFeedCategories(feed.id)
      expect(rows).toHaveLength(0)
    }, 30_000)

    it('is a no-op for a feed with no categories', async () => {
      const feed = await createTestRssFeed({})
      await expect(deleteRssFeedCategories(feed.id)).resolves.not.toThrow()
    }, 30_000)
  })

  describe('backfillCategoriesForTopicAlias', () => {
    it('fills topic_id for existing rows matching the topic slug', async () => {
      const slug = `podcast-cat-${createRandomString(10)}`
      const feed = await createTestRssFeed({})
      // Insert with null topic_id (topic doesn't exist yet)
      await upsertRssFeedCategories(feed.id, [slug])
      const before = await getRssFeedCategories(feed.id)
      expect(before.find(r => r.category_text === slug)?.topic_id).toBeNull()

      // Create the topic and run the backfill
      const topic = await createTestTopic({ slug, name: slug })
      const count = await backfillCategoriesForTopicAlias(topic.id)
      expect(count).toBeGreaterThan(0)

      const after = await getRssFeedCategories(feed.id)
      expect(after.find(r => r.category_text === slug)?.topic_id).toBe(topic.id)
    }, 30_000)

    it('returns 0 when no rows match', async () => {
      const topic = await createTestTopic({
        slug: `no-match-${createRandomString(8)}`,
        name: `No Match ${createRandomString(8)}`,
      })
      const count = await backfillCategoriesForTopicAlias(topic.id)
      expect(count).toBe(0)
    }, 30_000)
  })

  describe('getRssFeedCategories', () => {
    it('returns categories ordered alphabetically', async () => {
      const feed = await createTestRssFeed({})
      await upsertRssFeedCategories(feed.id, ['Science', 'Arts', 'Business'])
      const rows = await getRssFeedCategories(feed.id)
      const texts = rows.map(r => r.category_text)
      expect(texts).toEqual([...texts].sort())
    }, 30_000)

    it('returns empty array for a feed with no categories', async () => {
      const feed = await createTestRssFeed({})
      const rows = await getRssFeedCategories(feed.id)
      expect(rows).toHaveLength(0)
    }, 30_000)
  })
})
