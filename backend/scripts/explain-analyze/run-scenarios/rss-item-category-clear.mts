import assert from 'node:assert/strict'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { RSS_FEED_ITEM_MAX_CATEGORIES } from '@services/rss-feed-items/processing-limits'
import { deleteStaleCategoriesAndRetractVotes } from '@services/rss-feed-items/reconcile-categories-delete'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { RssWriteCapacityFixture } from './rss-write-capacity-fixture.mts'

type CategoryKey = { rss_feed_item_id: string; category_text: string }

export async function runRssItemCategoryClearScenario(fixture: RssWriteCapacityFixture) {
  const scenario = 'rss-item-category-clear-at-cap'
  const limit = getRssFeedItemsWorkLimit('category_clear_batch_size')
  const targetCount = Math.floor(limit / (RSS_FEED_ITEM_MAX_CATEGORIES - 1)) + 1
  const targetIds = fixture.itemIds.slice(0, targetCount)
  const scope = fixture.itemIds.slice(0, targetCount + 1)
  // The preceding write scenario leaves a full set of unmapped categories on each item.
  const initial = await readCategoryKeys(write, scope)
  assert.equal(initial.length, scope.length * RSS_FEED_ITEM_MAX_CATEGORIES)
  const snapshots = targetIds.map((rss_feed_item_id, index) => ({
    rss_feed_item_id,
    categories: [`#${fixture.prefix}h${index}c0`],
  }))
  const retainedCategory = new Map(snapshots.map(row => [row.rss_feed_item_id, row.categories[0]]))
  const removed = initial
    .filter(
      row =>
        retainedCategory.has(row.rss_feed_item_id) &&
        row.category_text !== retainedCategory.get(row.rss_feed_item_id),
    )
    .slice(0, limit)
  assert.equal(removed.length, limit)
  const expected = initial.filter(row => !removed.includes(row))
  registerScenarioContract(scenario, { expectations: [] })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const result = await deleteStaleCategoriesAndRetractVotes(snapshots, query)
      assert.equal(result.hasMore, true)
      assert.deepEqual(
        result.staleCategories.map(row => row.rss_feed_item_id).toSorted(),
        removed.map(row => row.rss_feed_item_id).toSorted(),
      )
      assert.deepEqual(await readCategoryKeys(query, scope), expected)
      await query.rollback()
    },
    undefined,
    ['reconcileRssFeedItemCategorySnapshots stalePage', 'reconcileRssFeedItemCategorySnapshots'],
  )
}

async function readCategoryKeys(query: QueryExecutor, itemIds: readonly string[]) {
  const { rows } = await query<CategoryKey>(
    `/* checkRssItemCategoryClear */
      SELECT category.rss_feed_item_id, identity.category_text
      FROM rss_feed_item_categories category
      JOIN rss_category_identities identity ON identity.id = category.category_identity_id
      WHERE category.rss_feed_item_id = ANY($1::uuid[])
      ORDER BY category.rss_feed_item_id, category.category_identity_id`,
    [itemIds],
  )
  return rows
}
