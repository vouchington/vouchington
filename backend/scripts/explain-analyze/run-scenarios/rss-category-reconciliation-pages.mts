import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { reconcileRssFeedItemCategorySnapshots } from '@services/rss-feed-items/category-snapshot-reconciliations'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { cleanupRssWriteCapacity, seedRssWriteCapacity } from './rss-write-capacity-fixture.mts'

type ReconciliationPage = Awaited<ReturnType<typeof reconcileRssFeedItemCategorySnapshots>>
type QueueRow = { rss_feed_item_id: string; change_id: string; updated_at: string }

export async function runRssCategoryReconciliationPageScenarios(): Promise<void> {
  const limit = getRssFeedItemsWorkLimit('category_snapshot_reconciliation_batch_size')
  const fixture = await seedRssWriteCapacity()
  try {
    const itemIds = fixture.itemIds.slice(0, 2 * limit + 1)
    assert.equal(itemIds.length, 2 * limit + 1)
    const { rows } = await write<QueueRow>(
      `/* seedRssCategoryReconciliationPages */ INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id, categories, created_at, updated_at)
       SELECT input.id, '[]'::jsonb, oldest.at, oldest.at
       FROM unnest($1::uuid[]) AS input(id)
       CROSS JOIN (
         SELECT COALESCE(MIN(updated_at), CURRENT_TIMESTAMP) - INTERVAL '1 second' AS at
         FROM rss_feed_item_category_snapshot_reconciliations
       ) oldest
       RETURNING rss_feed_item_id, change_id, updated_at::text`,
      [itemIds],
    )
    const byId = new Map(rows.map(row => [row.rss_feed_item_id, row]))
    const first = itemIds.slice(0, limit).map(id => byId.get(id)!)
    const next = itemIds.slice(limit, 2 * limit).map(id => byId.get(id)!)
    const cursor = cursorFor(first.at(-1)!)
    await capturePage('rss-category-reconciliation-first-at-cap', first, () =>
      reconcileRssFeedItemCategorySnapshots(limit),
    )
    await capturePage('rss-category-reconciliation-after-at-cap', next, () =>
      reconcileRssFeedItemCategorySnapshots(limit, undefined, cursor),
    )
  } finally {
    await cleanupRssWriteCapacity(fixture)
  }
}

async function capturePage(
  scenario: string,
  expected: readonly QueueRow[],
  readPage: () => Promise<ReconciliationPage>,
) {
  registerScenarioContract(scenario, { expectations: [] })
  await runAndCapture(
    scenario,
    async () => {
      const page = await readPage()
      assert.deepEqual(
        page.sourcePages?.map(row => [row.rssFeedItemId, row.changeId, row.generation]),
        expected.map(row => [row.rss_feed_item_id, row.change_id, '1']),
      )
      assert.deepEqual(page.after, cursorFor(expected.at(-1)!))
    },
    undefined,
    'reconcileRssFeedItemCategorySnapshots',
  )
}

function cursorFor(row: QueueRow) {
  return { updatedAt: row.updated_at, rssFeedItemId: row.rss_feed_item_id }
}
