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

    const topic = await createTopic(user!, {
      name: `Energy ${random}`,
      slug,
    })

    const result = await backfillCategoriesForTopicAliases(topic.id)
    expect(result.updated).toBeGreaterThanOrEqual(1)

    allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const after = allCategories.find(c => c.category_text === slug)
    expect(after?.topic_id).toBe(topic.id)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof softDeleteTopic)
  void (0 as unknown as typeof filterCategories)
})
