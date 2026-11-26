import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { getListAddItemsLimit } from '@services/lists/import-config'
import { filterListableRssFeedItemIds } from '@services/lists/listable'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { RssWriteCapacityFixture } from './rss-write-capacity-fixture.mts'

export async function runRssListabilityScenario(fixture: RssWriteCapacityFixture): Promise<void> {
  const limit = getListAddItemsLimit()
  const candidates = fixture.itemIds.slice(3, 3 + limit - 1)
  const [deletedItem, disabledSourceItem, ...eligible] = candidates
  assert.ok(deletedItem && disabledSourceItem)
  const ids = [...candidates, randomUUID()]
  assert.equal(ids.length, limit)
  await seedListability(fixture.feedId, deletedItem, disabledSourceItem)
  const scenario = 'rss-listability-at-add-items-cap'
  registerScenarioContract(scenario, {
    expectations: [],
    crossPartition: {
      rss_feed_items: 'A list add can include retained items from different ID partitions.',
    },
  })
  await runAndCapture(
    scenario,
    async () => assert.deepEqual(await filterListableRssFeedItemIds(ids), new Set(eligible)),
    undefined,
    'filterListableRssFeedItemIds',
  )
}

async function seedListability(feedId: string, deletedItem: string, disabledSourceItem: string) {
  await using query = await beginTransaction()
  await query(
    `/* seedRssListabilityEnabledFeed */ INSERT INTO rss_feed_setting_changes
      (change_type, rss_feed_id, is_enabled, reason) VALUES ('enablement', $1, TRUE, 'EXPLAIN listability fixture')`,
    [feedId],
  )
  await query(
    `/* seedRssListabilityDeletedItem */ UPDATE rss_feed_items
     SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [deletedItem],
  )
  await query(
    `/* seedRssListabilityDisabledSource */ WITH removed AS (
       DELETE FROM rss_feed_item_sources WHERE rss_feed_id = $1 AND rss_feed_item_id = $2
       RETURNING rss_feed_item_id
     ), disabled_feed AS (
       SELECT id FROM rss_feeds WHERE deleted_at IS NULL AND NOT is_enabled AND id <> $1
         AND hard_delete_requested_at IS NULL ORDER BY id LIMIT 1
     )
     INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
     SELECT disabled_feed.id, removed.rss_feed_item_id FROM disabled_feed CROSS JOIN removed`,
    [feedId, disabledSourceItem],
  ).then(({ rowCount }) => assert.equal(rowCount, 1))
  await query.commit()
}
