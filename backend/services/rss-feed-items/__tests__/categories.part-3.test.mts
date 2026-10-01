import { it, expect, beforeEach, describe } from 'vitest'
import { upsertRssFeedItemCategories, getRssFeedItemCategories } from '../categories.mts'
import { backfillCategoriesForTopicAliases } from '../backfill-categories-for-topic-aliases.mts'
import { createTopic } from '@services/topics'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createRssFeedItemCategoryTestFixture } from '../../../test-helpers/services/rss-feed-items/category-test-fixture.mts'

describe('categories', () => {
  let testRssFeedItemId: string

  beforeEach(async () => {
    const fixture = await createRssFeedItemCategoryTestFixture()
    testRssFeedItemId = fixture.testRssFeedItemId
  })

  it('backfillCategoriesForTopicAliases matches unlinked categories by topic slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const slug = `energy-${random}`

    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [slug],
      },
    ])

    let allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const before = allCategories.find(c => c.category_text === slug)
    expect(before?.topic_id).toBeNull()

    const topic = await createTopic(user!, WEB_PROVENANCE, {
      name: `Energy ${random}`,
      slug,
    })

    const result = await backfillCategoriesForTopicAliases(topic.id)
    expect(result.updated).toBeGreaterThanOrEqual(1)

    allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const after = allCategories.find(c => c.category_text === slug)
    expect(after?.topic_id).toBe(topic.id)
  })
})
