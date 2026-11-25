import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import {
  insertMissingCategories,
  insertMissingHashtagAliases,
  updateMatchedCategories,
} from '@services/rss-feed-items/categories-chunks'
import { registerRssCategoryIdentities } from '@services/rss-feed-items/category-identities'
import { RSS_FEED_ITEM_MAX_CATEGORIES } from '@services/rss-feed-items/processing-limits'
import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  rssWriteItemCategoryCapacity,
  type RssWriteCapacityFixture,
} from './rss-write-capacity-fixture.mts'

export async function runRssItemCategoryWriteScenarios(
  fixture: RssWriteCapacityFixture,
): Promise<void> {
  const rows = fixture.itemIds.flatMap((id, itemIndex) =>
    Array.from({ length: RSS_FEED_ITEM_MAX_CATEGORIES }, (_, categoryIndex) => {
      const alias = `${fixture.prefix}h${itemIndex}c${categoryIndex}`
      return { rss_feed_item_id: id, category: `#${alias}`, hashtag_alias: alias }
    }),
  )
  assert.equal(rows.length, rssWriteItemCategoryCapacity)
  const half = rows.length / 2
  const aliases = rows.map(row => row.hashtag_alias)
  await runHashtagWrite(aliases)
  // The measured insert follows the registration statement even when replayed by itself.
  await registerRssCategoryIdentities(
    rows.map(row => row.category),
    write,
  )

  const restore = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
    category_sql_batch_size: rssWriteItemCategoryCapacity,
  })
  const unmapped = rows.map(row => ({ ...row, hashtag_alias: null, topicId: null }))
  try {
    await insertCategoryBaseline(unmapped.slice(0, half))
    await runCategoryInsert(fixture, rows)
    await insertCategoryBaseline(unmapped.slice(half))
    await runCategoryUpdate(fixture, rows)
  } finally {
    restore()
  }
}

type ItemCategory = { rss_feed_item_id: string; category: string; hashtag_alias: string }

async function runHashtagWrite(aliases: string[]): Promise<void> {
  const scenario = 'rss-item-category-hashtag-aliases-at-cap'
  const marker = 'insertMissingHashtagAliases'
  const half = aliases.length / 2
  await insertMissingHashtagAliases(aliases.slice(0, half))
  const baseline = new Map(
    (await readAliases(aliases.slice(0, half))).map(row => [row.alias, row.id]),
  )
  assert.equal(baseline.size, half)
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxInputRows', nodeType: 'Sort', max: aliases.length },
      { kind: 'maxInputRows', nodeType: 'Function Scan', max: aliases.length },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      await insertMissingHashtagAliases(aliases)
      const rows = await readAliases(aliases)
      assert.deepEqual(rows.map(row => row.alias).toSorted(), aliases.toSorted())
      assert.ok(rows.every(row => !baseline.has(row.alias) || baseline.get(row.alias) === row.id))
    },
    undefined,
    marker,
    {
      exactCapturedNames: [marker, 'checkRssWriteCapacityAliases'],
      afterCapture: async () => {
        await write(
          '/* restoreRssWriteCapacityAliases */ DELETE FROM topic_aliases WHERE alias = ANY($1::text[])',
          [aliases.slice(half)],
        )
      },
    },
  )
  // Item-category inserts must resolve every hashtag alias used below.
  await insertMissingHashtagAliases(aliases.slice(half))
}

async function readAliases(aliases: string[]) {
  const { rows } = await write<{ id: string; alias: string }>(
    '/* checkRssWriteCapacityAliases */ SELECT id, alias FROM topic_aliases WHERE alias = ANY($1::text[])',
    [aliases],
  )
  return rows
}

async function insertCategoryBaseline(rows: Parameters<typeof insertMissingCategories>[0]) {
  await using query = await beginTransaction()
  const inserted = await insertMissingCategories(rows, query)
  assert.equal(inserted.length, rows.length)
  await query.commit()
}

async function runCategoryInsert(fixture: RssWriteCapacityFixture, rows: ItemCategory[]) {
  const scenario = 'rss-item-category-insert-at-cap'
  const marker = 'insertMissingCategories'
  const half = rows.length / 2
  registerScenarioContract(scenario, {
    // #6417 owns the measured custom-plan topic_aliases catalog scan.
    expectations: [],
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const inserted = await insertMissingCategories(
        rows.map(row => ({ ...row, topicId: fixture.topicId })),
        query,
      )
      assert.deepEqual(
        inserted.map(row => row.rss_feed_item_id).toSorted(),
        rows
          .slice(half)
          .map(row => row.rss_feed_item_id)
          .toSorted(),
      )
      assert.ok(
        inserted.every(row => row.topic_id === fixture.topicId && row.topic_alias_id !== null),
      )
      const { rows: counts } = await query<{ kept_unmapped: number; mapped: number }>(
        `/* checkRssWriteCapacityCategoryInsert */
         SELECT
           COUNT(*) FILTER (WHERE rss_feed_item_id = ANY($1::uuid[]) AND topic_id IS NULL AND topic_alias_id IS NULL)::int AS kept_unmapped,
           COUNT(*) FILTER (WHERE rss_feed_item_id = ANY($2::uuid[]) AND topic_id = $3::uuid AND topic_alias_id IS NOT NULL)::int AS mapped
         FROM rss_feed_item_categories
         WHERE rss_feed_item_id = ANY($1::uuid[]) OR rss_feed_item_id = ANY($2::uuid[])`,
        [
          fixture.itemIds.slice(0, fixture.itemIds.length / 2),
          fixture.itemIds.slice(fixture.itemIds.length / 2),
          fixture.topicId,
        ],
      )
      assert.deepEqual(counts, [{ kept_unmapped: half, mapped: half }])
      await query.rollback()
    },
    undefined,
    marker,
    {
      exactCapturedNames: [
        'registerRssCategoryIdentities',
        marker,
        'checkRssWriteCapacityCategoryInsert',
      ],
    },
  )
}

async function runCategoryUpdate(fixture: RssWriteCapacityFixture, rows: ItemCategory[]) {
  const scenario = 'rss-item-category-update-at-cap'
  const marker = 'updateMatchedCategories'
  registerScenarioContract(scenario, {
    // #6417 owns the measured custom-plan rss_feed_item_categories heap scan.
    expectations: [],
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const updated = await updateMatchedCategories(
        rows.map(row => ({ ...row, topicId: fixture.topicId })),
        query,
      )
      assert.deepEqual(
        updated.map(row => row.rss_feed_item_id).toSorted(),
        rows.map(row => row.rss_feed_item_id).toSorted(),
      )
      assert.ok(
        updated.every(row => row.previous_topic_id === null && row.topic_id === fixture.topicId),
      )
      await query.rollback()
    },
    undefined,
    marker,
    { exactCapturedNames: [marker] },
  )
}
