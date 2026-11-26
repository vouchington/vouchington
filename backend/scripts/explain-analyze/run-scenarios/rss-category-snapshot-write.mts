import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import {
  markRssFeedCategorySnapshotsForReconciliation,
  persistRssFeedItemCategorySnapshotReconciliations,
} from '@services/rss-feed-items/category-snapshot-reconciliations'
import { RSS_FEED_ITEM_MAX_CATEGORIES } from '@services/rss-feed-items/processing-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { RssWriteCapacityFixture } from './rss-write-capacity-fixture.mts'

export async function runRssCategorySnapshotWriteScenario(fixture: RssWriteCapacityFixture) {
  const existingCount = Math.floor(fixture.itemIds.length / 2)
  const snapshots = fixture.itemIds.map((id, index) => ({
    rss_feed_item_id: id,
    categories:
      index === 0
        ? []
        : Array.from(
            { length: RSS_FEED_ITEM_MAX_CATEGORIES },
            (_, label) => `category-${index}-${label}`,
          ),
  }))
  await using seed = await beginTransaction()
  await seed(
    `/* seedRssCategorySnapshotSources */ INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
     SELECT $1, id, '2020-01-01T00:00:00.000Z'::timestamptz
     FROM unnest($2::uuid[]) AS input(id) ON CONFLICT (rss_feed_id, rss_feed_item_id) DO NOTHING`,
    [fixture.feedId, fixture.itemIds],
  )
  await persistRssFeedItemCategorySnapshotReconciliations(
    seed,
    fixture.feedId,
    snapshots.slice(0, existingCount).map(row => ({ ...row, categories: ['older category'] })),
  )
  await seed.commit()

  const scenario = 'rss-category-snapshot-write-at-fetch-cap'
  registerScenarioContract(scenario, { allowEmptyResult: true, expectations: [] })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      await persistRssFeedItemCategorySnapshotReconciliations(query, fixture.feedId, snapshots)
      const { rows } = await query<{
        rss_feed_item_id: string
        source_categories: string[]
        requested_categories: string[]
        generation: string
      }>(
        `/* checkRssCategorySnapshotWrites */ SELECT snapshot.rss_feed_item_id,
           snapshot.categories AS source_categories, requested.categories AS requested_categories, requested.generation
         FROM rss_feed_item_source_category_snapshots snapshot
         JOIN rss_feed_item_category_snapshot_reconciliations requested USING (rss_feed_item_id)
         WHERE snapshot.rss_feed_id = $1 ORDER BY snapshot.rss_feed_item_id`,
        [fixture.feedId],
      )
      assert.deepEqual(
        rows,
        snapshots.map(({ rss_feed_item_id, categories }, index) => ({
          rss_feed_item_id,
          source_categories: categories,
          requested_categories: categories,
          generation: index < existingCount ? '2' : '1',
        })),
      )
      await query.rollback()
    },
    undefined,
    [
      'persistRssFeedItemSourceCategorySnapshots',
      'persistRssFeedItemCategorySnapshotReconciliations',
    ],
  )
  await captureFeedCategoryInvalidation(fixture, existingCount)
}

async function captureFeedCategoryInvalidation(
  fixture: RssWriteCapacityFixture,
  existingCount: number,
): Promise<void> {
  const scenario = 'rss-feed-category-invalidation-dense-sources'
  registerScenarioContract(scenario, { allowEmptyResult: true, expectations: [] })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      await markRssFeedCategorySnapshotsForReconciliation(query, fixture.feedId)
      const { rows } = await query<{
        rss_feed_item_id: string
        categories: string[]
        generation: string
      }>(
        `/* checkRssFeedCategoryInvalidation */ SELECT rss_feed_item_id, categories, generation
         FROM rss_feed_item_category_snapshot_reconciliations
         WHERE rss_feed_item_id = ANY($1::uuid[]) ORDER BY rss_feed_item_id`,
        [fixture.itemIds],
      )
      assert.deepEqual(
        rows,
        fixture.itemIds.map((rss_feed_item_id, index) => ({
          rss_feed_item_id,
          categories: index < existingCount ? ['older category'] : [],
          generation: index < existingCount ? '2' : '1',
        })),
      )
      await query.rollback()
    },
    undefined,
    'markRssFeedCategorySnapshotsForReconciliation',
  )
}
