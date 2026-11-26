import assert from 'node:assert/strict'
import { reconcileRssFeedItemCategorySnapshots } from '@services/rss-feed-items/category-snapshot-reconciliations'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { CategoryProjectionPendingRow } from '../seed-data/category-projection.mts'

type ReconciliationPage = Awaited<ReturnType<typeof reconcileRssFeedItemCategorySnapshots>>

export async function runRssCategoryReconciliationPageScenarios(
  pendingRows: readonly CategoryProjectionPendingRow[],
): Promise<void> {
  const limit = getRssFeedItemsWorkLimit('category_snapshot_reconciliation_batch_size')
  assert.ok(pendingRows.length > 2 * limit)
  assert.equal(new Set(pendingRows.map(row => row.updated_at)).size, 1)
  const ordered = pendingRows.toSorted((a, b) =>
    a.rss_feed_item_id.localeCompare(b.rss_feed_item_id),
  )
  const first = ordered.slice(0, limit)
  const next = ordered.slice(limit, 2 * limit)
  const cursor = cursorFor(first.at(-1)!)
  await capturePage('rss-category-reconciliation-first-at-cap', first, () =>
    reconcileRssFeedItemCategorySnapshots(limit),
  )
  await capturePage('rss-category-reconciliation-after-at-cap', next, () =>
    reconcileRssFeedItemCategorySnapshots(limit, undefined, cursor),
  )
}

async function capturePage(
  scenario: string,
  expected: readonly CategoryProjectionPendingRow[],
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

function cursorFor(row: CategoryProjectionPendingRow) {
  return { updatedAt: row.updated_at, rssFeedItemId: row.rss_feed_item_id }
}
