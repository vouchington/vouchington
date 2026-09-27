import { write, type QueryExecutor } from '@data-stores/psql'
import { enqueueBulkReconcileRssFeedItemNotifications } from '@queues/notifications/enqueues'
import { upsertRssFeedItemCategories, type RssFeedItemCategoryInput } from './categories.mts'
import {
  orderedCategorySnapshots,
  replaceCategorySnapshotChildren,
} from './category-snapshot-rows.mts'

export const CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE = 25

export type RssFeedItemCategorySnapshotReconciliation = RssFeedItemCategoryInput & {
  generation: string
}

/** Persist desired complete snapshots in the caller's item/source transaction. */
export async function persistRssFeedItemCategorySnapshotReconciliations(
  query: QueryExecutor,
  rssFeedId: string,
  snapshots: readonly RssFeedItemCategoryInput[],
): Promise<void> {
  if (snapshots.length === 0) return
  const orderedSnapshots = orderedCategorySnapshots(snapshots)
  const itemIds = orderedSnapshots.map(snapshot => snapshot.rss_feed_item_id)
  await query(
    `/* persistRssFeedItemSourceCategorySnapshots */
      INSERT INTO rss_feed_item_source_category_snapshots
        (rss_feed_id, rss_feed_item_id)
      SELECT $1, rss_feed_item_id
      FROM UNNEST($2::uuid[]) AS snapshot(rss_feed_item_id)
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_id, rss_feed_item_id) DO UPDATE
      SET updated_at = CURRENT_TIMESTAMP`,
    [rssFeedId, itemIds],
  )
  await query(
    `/* persistRssFeedItemCategorySnapshotReconciliations */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id)
      SELECT rss_feed_item_id
      FROM UNNEST($1::uuid[]) AS snapshot(rss_feed_item_id)
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
          updated_at = CURRENT_TIMESTAMP`,
    [itemIds],
  )
  await replaceCategorySnapshotChildren(query, rssFeedId, orderedSnapshots)
}

export async function markRssFeedItemCategorySnapshotsForReconciliation(
  query: QueryExecutor,
  rssFeedItemIds: readonly string[],
): Promise<void> {
  if (rssFeedItemIds.length === 0) return
  const orderedIds = [...new Set(rssFeedItemIds)].sort((left, right) => left.localeCompare(right))
  await query(
    `/* markRssFeedItemCategorySnapshotsForReconciliation */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id)
      SELECT rss_feed_item_id
      FROM UNNEST($1::uuid[]) AS snapshot(rss_feed_item_id)
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
          updated_at = CURRENT_TIMESTAMP`,
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
        (rss_feed_item_id)
      SELECT rss_feed_item_id
      FROM rss_feed_item_sources
      WHERE rss_feed_id = $1::uuid
      ORDER BY rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
          updated_at = CURRENT_TIMESTAMP`,
    [rssFeedId],
  )
}

/** Drains a bounded, oldest-first durable outbox; stale generation acknowledgements retain new work. */
export async function reconcileRssFeedItemCategorySnapshots(): Promise<{ reconciled: number }> {
  const { rows } = await write<RssFeedItemCategorySnapshotReconciliation>(
    `/* reconcileRssFeedItemCategorySnapshots */
      SELECT
        parent.rss_feed_item_id,
        parent.generation,
        COALESCE(
          ARRAY(
            SELECT category.category_text
            FROM rss_feed_item_category_snapshot_reconciliation_categories category
            WHERE category.rss_feed_item_id = parent.rss_feed_item_id
            ORDER BY category.ordinal
          ),
          ARRAY[]::text[]
        ) AS categories
      FROM rss_feed_item_category_snapshot_reconciliations parent
      ORDER BY updated_at, rss_feed_item_id
      LIMIT $1`,
    [CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE],
  )
  return reconcileRssFeedItemCategorySnapshotRows(rows)
}

/** Applies selected rows independently so one poison snapshot does not starve its batch peers. */
export async function reconcileRssFeedItemCategorySnapshotRows(
  rows: readonly RssFeedItemCategorySnapshotReconciliation[],
): Promise<{ reconciled: number }> {
  let reconciled = 0
  const errors: unknown[] = []
  for (const row of rows) {
    try {
      assertCategorySnapshot(row)
      // eslint-disable-next-line no-await-in-loop -- complete one source-union read before this snapshot's acknowledgement.
      const categorySnapshot = await getRssFeedItemCategorySnapshot(row.rss_feed_item_id)
      // eslint-disable-next-line no-await-in-loop -- complete one snapshot before its exact-generation acknowledgement.
      await upsertRssFeedItemCategories([categorySnapshot])
      // Keep notification eligibility in step with the durable category projection. The snapshot
      // remains pending if this enqueue fails, so the next reconciliation retries both the
      // notification prompt and its exact-generation acknowledgement.
      // eslint-disable-next-line no-await-in-loop -- each snapshot must enqueue before its own acknowledgement.
      await enqueueBulkReconcileRssFeedItemNotifications([row.rss_feed_item_id])
      // eslint-disable-next-line no-await-in-loop -- a compare-and-delete must follow this item only.
      await acknowledgeRssFeedItemCategorySnapshot(row)
      reconciled += 1
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0)
    throw new AggregateError(errors, 'RSS feed item category snapshot reconciliation failed')
  return { reconciled }
}

function assertCategorySnapshot(snapshot: RssFeedItemCategorySnapshotReconciliation): void {
  if (
    !Array.isArray(snapshot.categories) ||
    snapshot.categories.some(category => typeof category !== 'string')
  ) {
    throw new TypeError('RSS feed item category snapshot categories must be strings')
  }
}

async function getRssFeedItemCategorySnapshot(
  rssFeedItemId: string,
): Promise<RssFeedItemCategoryInput> {
  const { rows } = await write<{ categories: string[] }>(
    `/* getRssFeedItemCategorySnapshot */
      SELECT COALESCE(
        ARRAY(
          SELECT DISTINCT source_category.category_text
          FROM rss_feed_item_source_category_snapshots source_snapshot
          JOIN rss_feed_item_sources source
            ON source.rss_feed_id = source_snapshot.rss_feed_id
           AND source.rss_feed_item_id = source_snapshot.rss_feed_item_id
          JOIN rss_feeds feed ON feed.id = source.rss_feed_id
          JOIN rss_feed_item_source_category_snapshot_categories source_category
            ON source_category.rss_feed_id = source_snapshot.rss_feed_id
           AND source_category.rss_feed_item_id = source_snapshot.rss_feed_item_id
          WHERE source_snapshot.rss_feed_item_id = $1
            AND feed.deleted_at IS NULL
          ORDER BY source_category.category_text
        ),
        ARRAY[]::text[]
      ) AS categories`,
    [rssFeedItemId],
  )
  return { rss_feed_item_id: rssFeedItemId, categories: rows[0]!.categories }
}

export async function acknowledgeRssFeedItemCategorySnapshot(
  snapshot: RssFeedItemCategorySnapshotReconciliation,
): Promise<void> {
  await write(
    `/* acknowledgeRssFeedItemCategorySnapshot */
      DELETE FROM rss_feed_item_category_snapshot_reconciliations
      WHERE rss_feed_item_id = $1 AND generation = $2`,
    [snapshot.rss_feed_item_id, snapshot.generation],
  )
}
