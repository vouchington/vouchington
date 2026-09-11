import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  deleteUnmappedRssFeedItemCategory,
  getUnmappedRssFeedItemCategoryCount,
  insertUnmappedRssFeedItemCategory,
  setUnmappedRssFeedItemCategoryCountUpdatedAtForTest,
} from '@voucha/test-helpers'
import {
  getUnmappedRssFeedItemCategories,
  rejectRssFeedItemCategory,
  unrejectRssFeedItemCategory,
  assignRssFeedItemCategoryToTopic,
} from './unmapped-categories.mts'
import type { PrivateUser } from '@services/users/types'

describe('unmapped-categories', () => {
  const r = () => randomUUID().slice(0, 8)

  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('getUnmappedRssFeedItemCategories', () => {
    it('refreshes the aggregate timestamp when a category count decreases', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const firstItem = await createTestRssFeedItemWithUrl(feedId)
      const secondItem = await createTestRssFeedItemWithUrl(feedId)
      const categoryText = `timestamp-${suffix}`

      await insertUnmappedRssFeedItemCategory(firstItem.id, categoryText)
      await insertUnmappedRssFeedItemCategory(secondItem.id, categoryText)
      const staleTimestamp = new Date('2000-01-01T00:00:00.000Z')
      await setUnmappedRssFeedItemCategoryCountUpdatedAtForTest(categoryText, staleTimestamp)
      const before = await getUnmappedRssFeedItemCategoryCount(categoryText)

      await deleteUnmappedRssFeedItemCategory(secondItem.id, categoryText)
      const after = await getUnmappedRssFeedItemCategoryCount(categoryText)

      expect(before?.item_count).toBe(2)
      expect(before?.updated_at).toEqual(staleTimestamp)
      expect(after?.item_count).toBe(1)
      expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime())
    })

    it('returns pending categories (topic_id IS NULL, not rejected) ordered by item_count DESC', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item1 = await createTestRssFeedItemWithUrl(feedId)
      const item2 = await createTestRssFeedItemWithUrl(feedId)
      const item3 = await createTestRssFeedItemWithUrl(feedId)

      const highCountCategory = `high-count-${suffix}`
      const lowCountCategory = `low-count-${suffix}`

      // highCountCategory appears 3 times, lowCountCategory appears 1 time
      await insertUnmappedRssFeedItemCategory(item1.id, highCountCategory)
      await insertUnmappedRssFeedItemCategory(item2.id, highCountCategory)
      await insertUnmappedRssFeedItemCategory(item3.id, highCountCategory)
      await insertUnmappedRssFeedItemCategory(item1.id, lowCountCategory)

      const result = await getUnmappedRssFeedItemCategories({ status: 'pending', limit: 100 })

      const highIdx = result.results.findIndex(c => c.category_text === highCountCategory)
      const lowIdx = result.results.findIndex(c => c.category_text === lowCountCategory)

      expect(highIdx).toBeGreaterThanOrEqual(0)
      expect(lowIdx).toBeGreaterThanOrEqual(0)
      // highCountCategory should appear before lowCountCategory (higher item_count)
      expect(highIdx).toBeLessThan(lowIdx)

      const highItem = result.results[highIdx]
      expect(highItem.item_count).toBe(3)
      expect(highItem.rejected).toBe(false)

      const lowItem = result.results[lowIdx]
      expect(lowItem.item_count).toBe(1)
      expect(lowItem.rejected).toBe(false)
    })

    it('returns rejected categories when status=rejected', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)

      const pendingCategory = `pending-only-${suffix}`
      const rejectedCategory = `rejected-only-${suffix}`

      await insertUnmappedRssFeedItemCategory(item.id, pendingCategory)
      await insertUnmappedRssFeedItemCategory(item.id, rejectedCategory)
      await rejectRssFeedItemCategory(adminUser, rejectedCategory)

      const result = await getUnmappedRssFeedItemCategories({ status: 'rejected', limit: 100 })

      const rejectedTexts = result.results.map(c => c.category_text)
      expect(rejectedTexts).toContain(rejectedCategory)
      expect(rejectedTexts).not.toContain(pendingCategory)

      const rejectedItem = result.results.find(c => c.category_text === rejectedCategory)
      expect(rejectedItem?.rejected).toBe(true)
    })

    it('returns all unmapped categories when status=all', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)

      const pendingCategory = `all-pending-${suffix}`
      const rejectedCategory = `all-rejected-${suffix}`

      await insertUnmappedRssFeedItemCategory(item.id, pendingCategory)
      await insertUnmappedRssFeedItemCategory(item.id, rejectedCategory)
      await rejectRssFeedItemCategory(adminUser, rejectedCategory)

      const result = await getUnmappedRssFeedItemCategories({ status: 'all', limit: 100 })

      const texts = result.results.map(c => c.category_text)
      expect(texts).toContain(pendingCategory)
      expect(texts).toContain(rejectedCategory)
    })

    it('paginates with cursor correctly', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)

      // Insert two items with the same category to guarantee item_count=2 for cat-a
      // and category cat-b with item_count=1, both with scores unlikely to collide
      const [itemA1, itemA2, itemB] = await Promise.all([
        createTestRssFeedItemWithUrl(feedId),
        createTestRssFeedItemWithUrl(feedId),
        createTestRssFeedItemWithUrl(feedId),
      ])
      const catA = `page-cursor-a-${suffix}` // item_count = 2
      const catB = `page-cursor-b-${suffix}` // item_count = 1
      await Promise.all([
        insertUnmappedRssFeedItemCategory(itemA1.id, catA),
        insertUnmappedRssFeedItemCategory(itemA2.id, catA),
        insertUnmappedRssFeedItemCategory(itemB.id, catB),
      ])

      // With limit=1, page 1 has catA (item_count=2); catB must be on page 2+
      const page1 = await getUnmappedRssFeedItemCategories({ status: 'all', limit: 1 })
      expect(page1.results.length).toBe(1)
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).not.toBeNull()

      const page2 = await getUnmappedRssFeedItemCategories({
        status: 'all',
        limit: 1,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.length).toBe(1)
      // The two pages must not return the same category
      expect(page2.results[0].category_text).not.toBe(page1.results[0].category_text)
    })
  })

  describe('rejectRssFeedItemCategory', () => {
    it('creates a rejection so that the category is hidden from pending filter', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      const categoryText = `to-reject-${suffix}`

      await insertUnmappedRssFeedItemCategory(item.id, categoryText)

      // Before rejection: not yet in rejected view
      const beforeRejected = await getUnmappedRssFeedItemCategories({
        status: 'rejected',
        limit: 100,
      })
      expect(beforeRejected.results.map(c => c.category_text)).not.toContain(categoryText)

      await rejectRssFeedItemCategory(adminUser, categoryText)

      // After rejection: appears in rejected view (rejection table is the source, no pagination concern)
      const afterRejected = await getUnmappedRssFeedItemCategories({
        status: 'rejected',
        limit: 100,
      })
      expect(afterRejected.results.map(c => c.category_text)).toContain(categoryText)
    })

    it('is idempotent (second rejection call does not throw)', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      const categoryText = `idempotent-reject-${suffix}`

      await insertUnmappedRssFeedItemCategory(item.id, categoryText)
      await rejectRssFeedItemCategory(adminUser, categoryText)
      await expect(rejectRssFeedItemCategory(adminUser, categoryText)).resolves.toBeUndefined()
    })

    it('throws 403 for non-admin users', async () => {
      await expect(rejectRssFeedItemCategory(regularUser, 'test-403')).rejects.toMatchObject({
        status: 403,
      })
    })
  })

  describe('unrejectRssFeedItemCategory', () => {
    it('removes the rejection so that the category returns to pending', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      const categoryText = `to-unreject-${suffix}`

      await insertUnmappedRssFeedItemCategory(item.id, categoryText)
      await rejectRssFeedItemCategory(adminUser, categoryText)

      // Confirm it's in the rejected view (rejection table is the source)
      const afterReject = await getUnmappedRssFeedItemCategories({ status: 'rejected', limit: 100 })
      expect(afterReject.results.map(c => c.category_text)).toContain(categoryText)

      await unrejectRssFeedItemCategory(adminUser, categoryText)

      // After unreject: no longer in rejected view
      const afterUnreject = await getUnmappedRssFeedItemCategories({
        status: 'rejected',
        limit: 100,
      })
      expect(afterUnreject.results.map(c => c.category_text)).not.toContain(categoryText)
    })

    it('throws 403 for non-admin users', async () => {
      await expect(unrejectRssFeedItemCategory(regularUser, 'test-403')).rejects.toMatchObject({
        status: 403,
      })
    })
  })

  describe('assignRssFeedItemCategoryToTopic', () => {
    it('adds alias and backfills topic_id, returns updated count', async () => {
      const suffix = r()
      const topic = await createTestTopic({ user: adminUser })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      const categoryText = `assign-cat-${suffix}`

      await insertUnmappedRssFeedItemCategory(item.id, categoryText)

      // Confirm it appears in pending before assignment
      const before = await getUnmappedRssFeedItemCategories({ status: 'pending', limit: 100 })
      expect(before.results.map(c => c.category_text)).toContain(categoryText)

      const result = await assignRssFeedItemCategoryToTopic(adminUser, {
        categoryText,
        topicId: topic.id,
      })

      expect(typeof result.updated).toBe('number')
      expect(result.updated).toBeGreaterThanOrEqual(1)

      // After assignment the category should no longer appear in unmapped pending
      const after = await getUnmappedRssFeedItemCategories({ status: 'pending', limit: 100 })
      expect(after.results.map(c => c.category_text)).not.toContain(categoryText)
    })

    it('throws 403 for non-admin users', async () => {
      const topic = await createTestTopic({ user: adminUser })
      await expect(
        assignRssFeedItemCategoryToTopic(regularUser, {
          categoryText: 'test-cat',
          topicId: topic.id,
        }),
      ).rejects.toMatchObject({ status: 403 })
    })
  })
})
