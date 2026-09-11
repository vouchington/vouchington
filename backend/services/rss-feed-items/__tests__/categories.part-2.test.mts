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

  it('upsertRssFeedItemCategories matches category to topic by name (no alias needed)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicName = `Finance Corp ${random}`
    const topic = await createTopic(user!, {
      name: topicName,
      slug: `finance-corp-${random}`,
    })

    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [topicName],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const matched = allCategories.find(c => c.category_text === topicName)
    expect(matched?.topic_id).toBe(topic.id)
  })

  it('upsertRssFeedItemCategories matches topic name case-insensitively', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, {
      name: `Bank Of America ${random}`,
      slug: `bank-of-america-${random}`,
    })

    // Category arrives in mixed case from RSS feed and retains its source spelling.
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [`Bank Of America ${random}`],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const matched = allCategories.find(c => c.category_text === `Bank Of America ${random}`)
    expect(matched?.topic_id).toBe(topic.id)
  })

  it('upsertRssFeedItemCategories prefers alias match over topic name match', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const sharedText = `shared-label-${random}`

    // Topic A has sharedText as an alias
    const topicA = await createTopic(user!, {
      name: `Topic A ${random}`,
      slug: `topic-a-${random}`,
    })
    await createTopicAliases(topicA.id, [sharedText])

    // Topic B has sharedText as its name
    const topicB = await createTopic(user!, {
      name: sharedText,
      slug: `topic-b-${random}`,
    })

    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [sharedText],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const matched = allCategories.find(c => c.category_text === sharedText)
    // Alias (topic A) takes precedence over name match (topic B)
    expect(matched?.topic_id).toBe(topicA.id)
    expect(matched?.topic_id).not.toBe(topicB.id)
  })

  it('backfillCategoriesForTopicAliases matches unlinked categories by topic name', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicName = `Health Care ${random}`

    // Insert categories with no topic match
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [topicName],
      },
    ])

    let allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const before = allCategories.find(c => c.category_text === topicName)
    expect(before?.topic_id).toBeNull()

    // Create the topic after categories already exist
    const topic = await createTopic(user!, {
      name: topicName,
      slug: `health-care-${random}`,
    })

    const result = await backfillCategoriesForTopicAliases(topic.id)
    expect(result.updated).toBeGreaterThanOrEqual(1)

    allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const after = allCategories.find(c => c.category_text === topicName)
    expect(after?.topic_id).toBe(topic.id)
  })

  it('upsertRssFeedItemCategories does not match deleted topics by name', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicName = `Deleted Corp ${random}`
    const topic = await createTopic(user!, {
      name: topicName,
      slug: `deleted-corp-${random}`,
    })

    await softDeleteTopic(topic.id, user!.id)

    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [topicName],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const matched = allCategories.find(c => c.category_text === topicName)
    expect(matched?.topic_id).toBeNull()
  })

  it('upsertRssFeedItemCategories matches category to topic by slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const slug = `tech-sector-${random}`
    const topic = await createTopic(user!, {
      name: `Tech Sector ${random}`,
      slug,
    })

    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [slug],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const matched = allCategories.find(c => c.category_text === slug)
    expect(matched?.topic_id).toBe(topic.id)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof filterCategories)
})
