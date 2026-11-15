import type { RssFeedItemCategoryParentCursor } from '@queues/rss-feed-maintenance/types'
import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import { write, type QueryExecutor } from '@data-stores/psql'
import type { RssFeedItemCategoryInput } from './categories.mts'
import type { CategorySnapshotPageResult } from './category-source-pages.mts'
export { reconcileRssFeedItemCategorySourcePage } from './category-source-pages.mts'

type RssFeedItemCategorySnapshotReconciliation = {
  rss_feed_item_id: string
  change_id: string
  generation: string
  updated_at: string
}

/** Persist desired complete snapshots in the caller's item/source transaction. */
export async function persistRssFeedItemCategorySnapshotReconciliations(
  query: QueryExecutor,
  rssFeedId: string,
  snapshots: readonly RssFeedItemCategoryInput[],
): Promise<void> {
  if (snapshots.length === 0) return
  const orderedSnapshots = [
    ...new Map(snapshots.map(snapshot => [snapshot.rss_feed_item_id, snapshot])),
  ]
    .map(([, snapshot]) => snapshot)
    .toSorted((left, right) => left.rss_feed_item_id.localeCompare(right.rss_feed_item_id))
  await query(
    `/* persistRssFeedItemSourceCategorySnapshots */
      INSERT INTO rss_feed_item_source_category_snapshots
        (rss_feed_id, rss_feed_item_id, categories)
      SELECT $1::uuid AS rss_feed_id, rss_feed_item_id, categories
      FROM UNNEST($2::uuid[], $3::jsonb[]) AS snapshot(rss_feed_item_id, categories)
      ORDER BY rss_feed_id, rss_feed_item_id
      ON CONFLICT (rss_feed_id, rss_feed_item_id) DO UPDATE
      SET categories = EXCLUDED.categories`,
    [
      rssFeedId,
      orderedSnapshots.map(snapshot => snapshot.rss_feed_item_id),
      orderedSnapshots.map(snapshot => JSON.stringify(snapshot.categories)),
    ],
  )
  await query(
    `/* persistRssFeedItemCategorySnapshotReconciliations */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id, categories)
      SELECT rss_feed_item_id, categories
      FROM UNNEST($1::uuid[], $2::jsonb[]) AS snapshot(rss_feed_item_id, categories)
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET categories = EXCLUDED.categories,
          generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
          change_id = uuidv7()`,
    [
      orderedSnapshots.map(snapshot => snapshot.rss_feed_item_id),
      orderedSnapshots.map(snapshot => JSON.stringify(snapshot.categories)),
    ],
  )
}

export async function markRssFeedItemCategorySnapshotsForReconciliation(
  query: QueryExecutor,
  rssFeedItemIds: readonly string[],
): Promise<void> {
  if (rssFeedItemIds.length === 0) return
  const orderedIds = [...new Set(rssFeedItemIds)].toSorted((left, right) =>
    left.localeCompare(right),
  )
  await query(
    `/* markRssFeedItemCategorySnapshotsForReconciliation */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id, categories)
      SELECT rss_feed_item_id, '[]'::jsonb
      FROM UNNEST($1::uuid[]) AS snapshot(rss_feed_item_id)
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
          change_id = uuidv7()`,
    [orderedIds],
  )
}

export async function markRssFeedCategorySnapshotsForReconciliation(
  query: QueryExecutor,
  rssFeedId: string,
): Promise<void> {
  await query(
    `/* markRssFeedCategorySnapshotsForReconciliation */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id, categories)
      SELECT rss_feed_item_id, '[]'::jsonb
      FROM rss_feed_item_sources
      WHERE rss_feed_id = $1::uuid
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
          change_id = uuidv7()`,
    [rssFeedId],
  )
}

/** Select one bounded oldest-first outbox page; source jobs own exact-generation acknowledgement. */
export async function reconcileRssFeedItemCategorySnapshots(
  CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE = getRssFeedItemsWorkLimit(
    'category_snapshot_reconciliation_batch_size',
  ),
  rssFeedItemIds?: readonly string[],
  after?: RssFeedItemCategoryParentCursor,
): Promise<CategorySnapshotPageResult> {
  if (rssFeedItemIds?.length === 0) return { reconciled: 0 }
  const { rows } = await write<RssFeedItemCategorySnapshotReconciliation>(
    `/* reconcileRssFeedItemCategorySnapshots */
      SELECT rss_feed_item_id, generation, change_id, updated_at::text AS updated_at
      FROM rss_feed_item_category_snapshot_reconciliations
      WHERE (updated_at, rss_feed_item_id) > ($2::timestamptz, $3::uuid)
      ${rssFeedItemIds ? 'AND rss_feed_item_id = ANY($4::uuid[])' : ''}
      ORDER BY updated_at, rss_feed_item_id
      LIMIT $1`,
    [
      CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE,
      after?.updatedAt ?? '-infinity',
      after?.rssFeedItemId ?? '00000000-0000-0000-0000-000000000000',
      ...(rssFeedItemIds ? [rssFeedItemIds] : []),
    ],
  )
  const result: CategorySnapshotPageResult = {
    reconciled: 0,
    ...(rows.length
      ? {
          sourcePages: rows.map(row => ({
            rssFeedItemId: row.rss_feed_item_id,
            changeId: row.change_id,
            generation: row.generation,
            afterFeedId: null,
            categories: [],
            phase: 'sources' as const,
          })),
        }
      : {}),
  }
  if (rows.length === CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE) {
    const last = rows.at(-1)!
    result.after = {
      updatedAt: last.updated_at,
      rssFeedItemId: last.rss_feed_item_id,
    }
  }
  return result
}
