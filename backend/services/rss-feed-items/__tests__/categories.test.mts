import { it, expect, beforeEach, describe } from 'vitest'

import {
  upsertRssFeedItemCategories,
  getRssFeedItemCategories,
  backfillCategoriesForTopicAliases,
} from '../categories.mts'

import { createTopic } from '@services/topics'

import { createTopicAliases } from '@services/topics/aliases'

import { upsertRssFeedItems } from '../upsert.mts'

import { v4 as uuid } from 'uuid'

import {
  createTestTopic,
  createTestUser,
  softDeleteTopic,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'

describe('categories', () => {
  type Category = { category_text: string; topic_id: string | null }

  const filterCategories = (categories: Category[], categoryTexts: string[]) =>
    categories.filter(c => categoryTexts.includes(c.category_text))

  let testTopicId: string

  let testRssFeedId: string

  let testRssFeedItemId: string

  let testAliases: string[]

  let testCategories: string[]

  beforeEach(async () => {
    // Create a test user and topic with aliases
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `categories-${random}.example.com`,
    })
    testTopicId = topic.id
    // Use unique aliases per test to avoid conflicts
    testAliases = [`technology-${random}`, `tech-${random}`, `computers-${random}`]
    await createTopicAliases(testTopicId, testAliases)

    // Use unique category names per test to avoid conflicts
    testCategories = [`science-${random}`, `politics-${random}`]

    // Create a test RSS feed and item
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://categories-${random}.example.com/feed-${random}.xml`,
      topicId: testTopicId,
      title: `Test Feed ${random}`,
    })
    testRssFeedId = feed.id
    const items = await upsertRssFeedItems(testRssFeedId, [
      {
        link: `https://test-${uuid()}.example.com/item1`,
        guid: `test-item-${uuid()}`,
        title: 'Test Item',
        categories: [testAliases[0], ...testCategories],
      },
    ])
    testRssFeedItemId = items[0].id
  })

  it('upsertRssFeedItemCategories creates categories and matches topics via aliases', async () => {
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [testAliases[0], testCategories[0]],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const categories = filterCategories(allCategories, [testAliases[0], testCategories[0]])
    expect(categories).toHaveLength(2)

    // Technology alias should be matched to the topic (via alias)
    const techCategory = categories.find(c => c.category_text === testAliases[0])
    expect(techCategory?.topic_id).toBe(testTopicId)

    // Science should not be matched (no alias)
    const scienceCategory = categories.find(c => c.category_text === testCategories[0])
    expect(scienceCategory?.topic_id).toBeNull()
  })

  it('upsertRssFeedItemCategories retains the first authored category spelling', async () => {
    const testCategory = testAliases[0].toUpperCase()
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [`  ${testCategory}  `, testCategory, testAliases[0], ''],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const categories = filterCategories(allCategories, [testCategory])
    // Should dedupe on a case-insensitive key while retaining the source spelling.
    expect(categories).toHaveLength(1)
    expect(categories[0].category_text).toBe(testCategory)
  })

  it('deduplicates category casing across repeated ingests', async () => {
    const firstSpelling = `#Travel-${Math.random().toString(36).slice(2, 12)}`
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [firstSpelling] },
    ])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [firstSpelling.toUpperCase()] },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    expect(
      allCategories.filter(c => c.category_text.toLowerCase() === firstSpelling.toLowerCase()),
    ).toEqual([expect.objectContaining({ category_text: firstSpelling })])
  })

  it('upsertRssFeedItemCategories updates existing categories with topic_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const uniqueCategory = `science-${random}`

    // Create initial categories without topic
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [uniqueCategory],
      },
    ])

    // Create a topic with alias matching the category
    const user = await createTestUser({ administrator: true })
    const scienceTopic = await createTopic(user!, {
      name: `Science ${random}`,
      slug: `science-topic-${random}`,
    })
    await createTopicAliases(scienceTopic.id, [uniqueCategory])

    // Upsert again - should update the topic_id
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [uniqueCategory],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const categories = filterCategories(allCategories, [uniqueCategory])
    expect(categories).toHaveLength(1)
    expect(categories[0].topic_id).toBe(scienceTopic.id)
  })

  it('upsertRssFeedItemCategories handles multiple items in batch', async () => {
    const random = Math.random().toString(36).slice(2, 15)

    // Create a second RSS feed item
    const items = await upsertRssFeedItems(testRssFeedId, [
      {
        link: `https://test-${uuid()}.example.com/item2`,
        guid: `test-item-${uuid()}`,
        title: 'Test Item 2',
        categories: [],
      },
    ])
    const secondItemId = items[0].id

    const category1 = `batch-cat1-${random}`
    const category2 = `batch-cat2-${random}`

    // Upsert categories for both items in one call
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [category1],
      },
      { rss_feed_item_id: secondItemId, categories: [category2] },
    ])

    const categories1 = await getRssFeedItemCategories(testRssFeedItemId)
    const categories2 = await getRssFeedItemCategories(secondItemId)

    expect(filterCategories(categories1, [category1])).toHaveLength(1)
    expect(filterCategories(categories2, [category2])).toHaveLength(1)
  })

  it('backfillCategoriesForTopicAliases updates categories when aliases change', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const uniqueCategories = [`science-${random}`, `biology-${random}`]

    // Create categories without topics
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: uniqueCategories,
      },
    ])

    // Verify they have no topic_id
    let allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    let categories = filterCategories(allCategories, uniqueCategories)
    expect(categories.every(r => r.topic_id === null)).toBe(true)

    // Create a topic and add matching aliases
    const user = await createTestUser({ administrator: true })
    const scienceTopic = await createTopic(user!, {
      name: `Science ${random}`,
      slug: `science-topic-${random}`,
    })
    await createTopicAliases(scienceTopic.id, uniqueCategories)

    // Backfill for this topic
    const result = await backfillCategoriesForTopicAliases(scienceTopic.id)

    expect(result.updated).toBe(2) // Both categories should be updated

    // Verify the updates
    allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    categories = filterCategories(allCategories, uniqueCategories)
    expect(categories).toHaveLength(2)
    expect(categories.every(r => r.topic_id === scienceTopic.id)).toBe(true)
  })

  it('backfillCategoriesForTopicAliases handles no aliases', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const emptyTopic = await createTopic(user!, {
      name: `Empty Topic ${random}`,
      slug: `empty-${random}`,
    })
    const result = await backfillCategoriesForTopicAliases(emptyTopic.id)

    expect(result.updated).toBe(0)
  })
  // The two cache-invalidation tests that used to live here moved to categories.part-4.test.mts
  // to stay under this file's 300-line cap (docs/checklists/commit.md).

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof softDeleteTopic)
})
