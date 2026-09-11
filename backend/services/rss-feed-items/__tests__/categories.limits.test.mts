import { it, expect, beforeEach, describe } from 'vitest'
import {
  buildRssFeedItemCategorySqlBatches,
  backfillCategoriesForTopicAliases,
  upsertRssFeedItemCategories,
  getRssFeedItemCategories,
} from '../categories.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { v4 as uuid } from 'uuid'
import {
  beginTransaction,
  createTestTopic,
  getPostgresPoolWaitCounts,
  getTestPostgresBackendProcessId,
  insertTestRssFeedDirect,
  lockTestRssFeedItemCategory,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { createTopicAliases } from '@services/topics/aliases'
import {
  RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE,
  RSS_FEED_ITEM_MAX_CATEGORIES,
} from '../processing-limits.mts'

describe('categories limits', () => {
  let testRssFeedId: string
  let testRssFeedItemId: string

  beforeEach(async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Category Limit Topic ${random}`,
      slug: `category-limit-topic-${random}`,
      hostname: `category-limits-${random}.example.com`,
    })
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://category-limits-${random}.example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Category Limit Feed ${random}`,
    })
    testRssFeedId = feed.id
    const items = await upsertRssFeedItems(testRssFeedId, [
      {
        link: `https://test-${uuid()}.example.com/item1`,
        guid: `test-item-${uuid()}`,
        title: 'Test Item',
      },
    ])
    testRssFeedItemId = items[0]!.id
  })

  it('does nothing when items contain no categories', async () => {
    await expect(
      upsertRssFeedItemCategories([{ rss_feed_item_id: testRssFeedItemId, categories: [] }]),
    ).resolves.toBeUndefined()
    await expect(getRssFeedItemCategories(testRssFeedItemId)).resolves.toEqual([])
  })

  it('upsertRssFeedItemCategories caps categories per item after normalization', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    await upsertRssFeedItemCategories([
      {
        rss_feed_item_id: testRssFeedItemId,
        categories: [
          ' Travel ',
          'travel',
          ...Array.from(
            { length: RSS_FEED_ITEM_MAX_CATEGORIES + 5 },
            (_, index) => `zzzz-category-cap-${random}-${index}`,
          ),
        ],
      },
    ])

    const allCategories = await getRssFeedItemCategories(testRssFeedItemId)
    const cappedCategories = allCategories.filter(
      category =>
        category.category_text.startsWith(`zzzz-category-cap-${random}-`) ||
        category.category_text === 'Travel',
    )
    expect(cappedCategories).toHaveLength(RSS_FEED_ITEM_MAX_CATEGORIES)
    expect(cappedCategories.filter(category => category.category_text === 'Travel')).toHaveLength(1)
  })

  it('upsertRssFeedItemCategories writes category pairs across SQL chunks', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const itemCount = Math.ceil(RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE / 20) + 1
    const items = await upsertRssFeedItems(
      testRssFeedId,
      Array.from({ length: itemCount }, (_, index) => ({
        link: `https://test-${uuid()}.example.com/chunked-categories-${index}`,
        guid: `zzzz-chunked-category-item-${uuid()}`,
        title: `Chunked Category Item ${index}`,
      })),
    )

    await upsertRssFeedItemCategories(
      items.map((item, itemIndex) => ({
        rss_feed_item_id: item.id,
        categories: Array.from(
          { length: RSS_FEED_ITEM_MAX_CATEGORIES },
          (_, categoryIndex) => `zzzz-chunked-${random}-${itemIndex}-${categoryIndex}`,
        ),
      })),
    )

    const firstCategories = await getRssFeedItemCategories(items[0]!.id)
    const lastCategories = await getRssFeedItemCategories(items.at(-1)!.id)
    expect(
      firstCategories.filter(category =>
        category.category_text.startsWith(`zzzz-chunked-${random}-0-`),
      ),
    ).toHaveLength(RSS_FEED_ITEM_MAX_CATEGORIES)
    expect(
      lastCategories.filter(category =>
        category.category_text.startsWith(`zzzz-chunked-${random}-${itemCount - 1}-`),
      ),
    ).toHaveLength(RSS_FEED_ITEM_MAX_CATEGORIES)
  })

  it('upsertRssFeedItemCategories updates matched categories across SQL chunks', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const itemCount = Math.ceil(RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE / 20) + 1
    const items = await upsertRssFeedItems(
      testRssFeedId,
      Array.from({ length: itemCount }, (_, index) => ({
        link: `https://test-${uuid()}.example.com/update-categories-${index}`,
        guid: `zzzz-update-category-item-${uuid()}`,
        title: `Update Category Item ${index}`,
      })),
    )
    const categoryInputs = items.map((item, itemIndex) => ({
      rss_feed_item_id: item.id,
      categories: Array.from(
        { length: RSS_FEED_ITEM_MAX_CATEGORIES },
        (_, categoryIndex) => `zzzz-update-${random}-${itemIndex}-${categoryIndex}`,
      ),
    }))
    await upsertRssFeedItemCategories(categoryInputs)

    const topic = await createTestTopic({
      name: `Update Limit Topic ${random}`,
      slug: `update-limit-topic-${random}`,
      hostname: `update-limit-${random}.example.com`,
    })
    await createTopicAliases(topic.id, [categoryInputs[0]!.categories[0]!])
    await upsertRssFeedItemCategories(categoryInputs)

    const categories = await getRssFeedItemCategories(items[0]!.id)
    const matched = categories.find(
      category => category.category_text === categoryInputs[0]!.categories[0]!,
    )
    expect(matched?.topic_id).toBe(topic.id)
  })

  it('bounds the 500-item by 20 mapped-category database workload', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const mappedTopic = await createTestTopic({
      name: `Mapped category limit ${random}`,
      slug: `mapped-category-limit-${random}`,
      hostname: `mapped-category-limit-${random}.example.com`,
    })
    const aliases = Array.from(
      { length: RSS_FEED_ITEM_MAX_CATEGORIES },
      (_, index) => `zzzz-scale-${random}-${index}`,
    )
    await createTopicAliases(mappedTopic.id, aliases)
    const feedItems = await upsertRssFeedItems(
      testRssFeedId,
      Array.from({ length: 500 }, (_, index) => ({
        link: `https://test-${uuid()}.example.com/scale-categories-${index}`,
        guid: `zzzz-scale-category-item-${uuid()}`,
        title: `Scale Category Item ${index}`,
      })),
    )
    const items = feedItems.map(item => ({
      rss_feed_item_id: item.id,
      categories: aliases.map(alias => `#${alias}`),
    }))

    const batches = buildRssFeedItemCategorySqlBatches(items)
    expect(batches).toHaveLength(10)
    expect(batches.every(batch => batch.length === RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE)).toBe(
      true,
    )
    expect(batches.flat()).toHaveLength(10_000)

    const heapBefore = process.memoryUsage().heapUsed
    let maximumPoolWaits = 0
    const poolWaitSampler = setInterval(() => {
      const waits = getPostgresPoolWaitCounts()
      maximumPoolWaits = Math.max(maximumPoolWaits, waits.read, waits.write)
    }, 2)
    const startedAt = performance.now()
    try {
      await upsertRssFeedItemCategories(items)
    } finally {
      clearInterval(poolWaitSampler)
    }

    expect(performance.now() - startedAt).toBeLessThan(60_000)
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(256 * 1024 * 1024)
    expect(maximumPoolWaits).toBeLessThanOrEqual(1)
    await expect(getRssFeedItemCategories(feedItems[0]!.id)).resolves.toHaveLength(20)
    await expect(getRssFeedItemCategories(feedItems.at(-1)!.id)).resolves.toHaveLength(20)
  }, 90_000)

  it('backfills aliases beyond one ordered database batch', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const alias = `zzzz-scale-alias-${random}`
    const items = await upsertRssFeedItems(
      testRssFeedId,
      Array.from({ length: 501 }, (_, index) => ({
        link: `https://test-${uuid()}.example.com/alias-backfill-${index}`,
        guid: `zzzz-alias-backfill-${uuid()}`,
        title: `Alias Backfill Item ${index}`,
      })),
    )
    await upsertRssFeedItemCategories(
      items.map(item => ({ rss_feed_item_id: item.id, categories: [alias] })),
    )
    const topic = await createTestTopic({
      name: `Alias Backfill Topic ${random}`,
      slug: `alias-backfill-topic-${random}`,
      hostname: `alias-backfill-${random}.example.com`,
    })
    await createTopicAliases(topic.id, [alias])

    const result = await backfillCategoriesForTopicAliases(topic.id)

    expect(result.updated).toBe(501)
    await expect(getRssFeedItemCategories(items[0]!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: alias, topic_id: topic.id }),
    ])
    await expect(getRssFeedItemCategories(items.at(-1)!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: alias, topic_id: topic.id }),
    ])
  }, 60_000)

  it('waits for locked matching categories instead of treating them as exhausted', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const alias = `zzzz-locked-alias-${random}`
    const [item] = await upsertRssFeedItems(testRssFeedId, [
      {
        link: `https://test-${uuid()}.example.com/locked-alias-backfill`,
        guid: `zzzz-locked-alias-backfill-${uuid()}`,
        title: 'Locked Alias Backfill Item',
      },
    ])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [alias] }])
    const topic = await createTestTopic({
      name: `Locked Alias Backfill Topic ${random}`,
      slug: `locked-alias-backfill-topic-${random}`,
      hostname: `locked-alias-backfill-${random}.example.com`,
    })
    await createTopicAliases(topic.id, [alias])

    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    async function holdMatchingCategory(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      await lockTestRssFeedItemCategory(item!.id, alias, query)
      ready.resolve()
      await release.promise
      await query.commit()
    }
    const holder = holdMatchingCategory()
    await ready.promise

    const backfill = backfillCategoriesForTopicAliases(topic.id)
    await waitForTestPostgresLockWaiter(
      await holderProcessId.promise,
      'backfillCategoriesForTopicAliases',
    )
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: alias, topic_id: null }),
    ])

    release.resolve()
    await holder
    await expect(backfill).resolves.toEqual({ updated: 1 })
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: alias, topic_id: topic.id }),
    ])
  })
})
