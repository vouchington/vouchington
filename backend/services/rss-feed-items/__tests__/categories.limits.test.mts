import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { it, expect, beforeEach, describe } from 'vitest'
import { upsertRssFeedItemCategories, getRssFeedItemCategories } from '../categories.mts'
import { buildRssFeedItemCategorySqlBatches } from '../category-batches.mts'
import { backfillCategoriesForTopicAliases } from '../backfill-categories-for-topic-aliases.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { v4 as uuid } from 'uuid'
import {
  beginTransaction,
  createTestTopic,
  getTestPostgresBackendProcessId,
  insertTestRssFeedDirect,
  lockTestRssFeedItemCategory,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { createTopicAliases } from '@services/topics/aliases'
import { RSS_FEED_ITEM_MAX_CATEGORIES } from '../processing-limits.mts'

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
            { length: RSS_FEED_ITEM_MAX_CATEGORIES + 1 },
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
    const restoreBatchSize = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      category_sql_batch_size: 2,
    })
    try {
      const random = Math.random().toString(36).slice(2, 15)
      const itemCount = 2
      const categoriesPerItem = 2
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
            { length: categoriesPerItem },
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
      ).toHaveLength(categoriesPerItem)
      expect(
        lastCategories.filter(category =>
          category.category_text.startsWith(`zzzz-chunked-${random}-${itemCount - 1}-`),
        ),
      ).toHaveLength(categoriesPerItem)
    } finally {
      restoreBatchSize()
    }
  })

  it('upsertRssFeedItemCategories updates matched categories across SQL chunks', async () => {
    const restoreBatchSize = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      category_sql_batch_size: 2,
    })
    try {
      const random = Math.random().toString(36).slice(2, 15)
      const itemCount = 2
      const categoriesPerItem = 2
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
          { length: categoriesPerItem },
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
    } finally {
      restoreBatchSize()
    }
  })

  it('backfills aliases beyond one ordered database batch', async () => {
    const restoreBatchSize = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      category_backfill_batch_size: 2,
    })
    try {
      const random = Math.random().toString(36).slice(2, 15)
      const alias = `zzzz-scale-alias-${random}`
      const items = await upsertRssFeedItems(
        testRssFeedId,
        Array.from({ length: 3 }, (_, index) => ({
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

      expect(result.updated).toBe(3)
      await expect(getRssFeedItemCategories(items[0]!.id)).resolves.toEqual([
        expect.objectContaining({ category_text: alias, topic_id: topic.id }),
      ])
      await expect(getRssFeedItemCategories(items.at(-1)!.id)).resolves.toEqual([
        expect.objectContaining({ category_text: alias, topic_id: topic.id }),
      ])
    } finally {
      restoreBatchSize()
    }
  })

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

describe('buildRssFeedItemCategorySqlBatches', () => {
  it('splits three normalized pairs across a batch size of two', () => {
    const restoreBatchSize = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      category_sql_batch_size: 2,
    })
    try {
      const batches = buildRssFeedItemCategorySqlBatches([
        {
          rss_feed_item_id: '00000000-0000-7000-8000-000000000001',
          categories: ['North', 'South'],
        },
        {
          rss_feed_item_id: '00000000-0000-7000-8000-000000000002',
          categories: ['East'],
        },
      ])
      expect(batches.map(batch => batch.length)).toEqual([2, 1])
      expect(batches.flat().map(row => row.category)).toEqual(['North', 'South', 'East'])
    } finally {
      restoreBatchSize()
    }
  })
})
