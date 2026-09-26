import { it, expect, beforeEach, describe } from 'vitest'
import {
  backfillCategoriesForTopicAliases,
  clearCategoriesForUnlinkedTopicAlias,
  getRssFeedItemCategories,
  upsertRssFeedItemCategories,
} from '../categories.mts'
import { createTopic } from '@services/topics'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import { upsertRssFeedItems } from '../upsert.mts'
import { caches } from '@services/entity-cache/caches'

import { getRssFeedItemById } from '../get.mts'

import { v4 as uuid } from 'uuid'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/rss-feed-items, so importing entity-fetch's cached getter back into
// rss-feed-items would create a fresh rss-feed-items<->entity-fetch cycle. Same cache
// instance/TTL/invalidation-keys as entity-fetch's getRssFeedItemByIdCached.
const getRssFeedItemByIdCached = caches.rss_feed_items.cacheGetByAny(getRssFeedItemById)

import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getRssFeedItemCategoryTopicRelationDeletedAt,
  getTestRssFeedCategories,
  getTopicAliasIdForTest,
  insertTestRssFeedCategory,
  softDeleteTopic,
  insertTestRssFeedDirect,
  getTestPostgresBackendProcessId,
  lockTestRssFeedItemCategory,
  setTestEntityRelationIdAndScore,
  waitForTestPostgresLockWaiter,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

describe('categories', () => {
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

  it('upsertRssFeedItemCategories invalidates the item entity cache', async () => {
    // Prime the cache: category with no topic yet
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [testCategories[0]] },
    ])
    const before = await getRssFeedItemByIdCached(testRssFeedItemId)
    const beforeCategory = before?.categories?.find(c => c.category_text === testCategories[0])
    expect(beforeCategory?.topic).toBeNull()

    // Add an alias that matches the category so the next upsert will set topic_id
    await createTopicAliases(testTopicId, [testCategories[0]])

    // Upsert again — should update topic_id and evict the cache
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [testCategories[0]] },
    ])

    // Relation vote stats are refreshed before cache invalidation, so this projection is visible
    // immediately after the upsert resolves.
    const projected = await getRssFeedItemById(testRssFeedItemId)
    expect(projected?.categories?.some(c => c.topic?.id === testTopicId)).toBe(true)

    // The cached getter observes the same freshly projected category.
    const after = await getRssFeedItemByIdCached(testRssFeedItemId)
    // After resolution the category moves to the topic-backed section (category_text = topic.name),
    // so find by topic.id rather than the original alias string.
    const afterCategory = after?.categories?.find(c => c.topic?.id === testTopicId)
    expect(afterCategory?.topic?.id).toBe(testTopicId)

    const aliasId = await getTopicAliasIdForTest(testCategories[0])
    const [topicRelation] = (await getEntityRelation(
      'relation__rss_feed_item__category__topic',
      testRssFeedItemId,
      testTopicId,
    )) as Array<{ id: string }>
    const [hashtagRelation] = (await getEntityRelation(
      'relation__rss_feed_item__category__topic_alias',
      testRssFeedItemId,
      aliasId!,
    )) as Array<{ id: string }>
    await Promise.all([
      setTestEntityRelationIdAndScore(
        'relation__rss_feed_item__category__topic',
        testRssFeedItemId,
        testTopicId,
        topicRelation!.id,
        0,
      ),
      setTestEntityRelationIdAndScore(
        'relation__rss_feed_item__category__topic_alias',
        testRssFeedItemId,
        aliasId!,
        hashtagRelation!.id,
        0,
      ),
    ])

    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [testCategories[0]] },
    ])
    const repaired = await getRssFeedItemById(testRssFeedItemId)
    const repairedCategory = repaired?.categories?.find(c => c.topic?.id === testTopicId)
    expect(repairedCategory?.hashtag?.topic_id).toBe(testTopicId)
  })

  it('backfillCategoriesForTopicAliases invalidates the item entity cache', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const uniqueCategory = `backfill-cache-${random}`

    // Insert a category row with no topic
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [uniqueCategory] },
    ])

    // Prime the cache
    const before = await getRssFeedItemByIdCached(testRssFeedItemId)
    const beforeCategory = before?.categories?.find(c => c.category_text === uniqueCategory)
    expect(beforeCategory?.topic).toBeNull()

    // Add the alias so the backfill can match it
    const user = await createTestUser({ administrator: true })
    const backfillTopic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Backfill Topic ${random}`,
      slug: `backfill-topic-${random}`,
    })
    await createTopicAliases(backfillTopic.id, [uniqueCategory])

    // Backfill — should set topic_id and evict the cache
    await backfillCategoriesForTopicAliases(backfillTopic.id)

    const projected = await getRssFeedItemById(testRssFeedItemId)
    expect(projected?.categories?.some(c => c.topic?.id === backfillTopic.id)).toBe(true)

    // The cached getter observes the same freshly projected category.
    const after = await getRssFeedItemByIdCached(testRssFeedItemId)
    // After backfill the category moves to the topic-backed section (category_text = topic.name),
    // so find by topic.id rather than the original alias string.
    const afterCategory = after?.categories?.find(c => c.topic?.id === backfillTopic.id)
    expect(afterCategory?.topic?.id).toBe(backfillTopic.id)
  })

  it('clears topic mappings and retracts direct categorizer support for an unlinked hashtag alias', async () => {
    const [alias] = await createTopicAliases(testTopicId, testAliases[0])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [`#${alias!.alias}`] },
    ])
    await unlinkTopicAlias(alias!.id, { expectedTopicId: testTopicId, skipSideEffects: true })

    await expect(clearCategoriesForUnlinkedTopicAlias(alias!.id, testTopicId)).resolves.toEqual({
      updated: 1,
    })
    await expect(getRssFeedItemCategories(testRssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category_text: `#${alias!.alias}`,
          topic_id: null,
        }),
      ]),
    )
    await expect(
      getRssFeedItemCategoryTopicRelationDeletedAt(testRssFeedItemId, testTopicId),
    ).resolves.toBeNull()
  })

  it('waits for locked stale mappings before reporting cleanup complete', async () => {
    const [alias] = await createTopicAliases(testTopicId, testAliases[0])
    const categoryText = `#${alias!.alias}`
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [categoryText] },
    ])
    await unlinkTopicAlias(alias!.id, { expectedTopicId: testTopicId, skipSideEffects: true })

    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    async function holdStaleCategory(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      await lockTestRssFeedItemCategory(testRssFeedItemId, categoryText, query)
      ready.resolve()
      await release.promise
      await query.commit()
    }
    const holder = holdStaleCategory()
    await ready.promise

    const cleanup = clearCategoriesForUnlinkedTopicAlias(alias!.id, testTopicId)
    await waitForTestPostgresLockWaiter(
      await holderProcessId.promise,
      'clearCategoriesForUnlinkedTopicAlias',
    )
    await expect(getRssFeedItemCategories(testRssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ category_text: categoryText })]),
    )

    release.resolve()
    await holder
    await expect(cleanup).resolves.toEqual({ updated: 1 })
    await expect(getRssFeedItemCategories(testRssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_text: categoryText, topic_id: null }),
      ]),
    )
  })

  it('clears a matching feed-level topic mapping for an unlinked hashtag alias', async () => {
    const [alias] = await createTopicAliases(testTopicId, testAliases[0])
    await insertTestRssFeedCategory(testRssFeedId, alias!.alias, testTopicId)
    await unlinkTopicAlias(alias!.id, { expectedTopicId: testTopicId, skipSideEffects: true })

    await clearCategoriesForUnlinkedTopicAlias(alias!.id, testTopicId)

    await expect(getTestRssFeedCategories(testRssFeedId)).resolves.toContainEqual({
      category_text: alias!.alias,
      topic_id: null,
    })
  })

  it('keeps an RSS topic mapping when the alias remains linked to its former topic', async () => {
    const [alias] = await createTopicAliases(testTopicId, testAliases[0])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [`#${alias!.alias}`] },
    ])

    await expect(clearCategoriesForUnlinkedTopicAlias(alias!.id, testTopicId)).resolves.toEqual({
      updated: 0,
    })
    await expect(getRssFeedItemCategories(testRssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category_text: `#${alias!.alias}`,
          topic_id: testTopicId,
        }),
      ]),
    )
  })

  it('keeps the direct topic relation while another category still maps the topic', async () => {
    const [removedAlias, retainedAlias] = await createTopicAliases(testTopicId, testAliases)
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [`#${removedAlias!.alias}`, `#${retainedAlias!.alias}`],
      },
    ])
    await unlinkTopicAlias(removedAlias!.id, {
      expectedTopicId: testTopicId,
      skipSideEffects: true,
    })

    await clearCategoriesForUnlinkedTopicAlias(removedAlias!.id, testTopicId)
    await expect(
      getRssFeedItemCategoryTopicRelationDeletedAt(testRssFeedItemId, testTopicId),
    ).resolves.toBeNull()
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof softDeleteTopic)
})
