import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import { write, type QueryExecutor } from '@data-stores/psql'
import { enqueueBulkReconcileRssFeedItemNotifications } from '@queues/notifications/enqueues'
import { upsertRssFeedItemCategories, type RssFeedItemCategoryInput } from './categories.mts'

type RssFeedItemCategorySnapshotReconciliation = RssFeedItemCategoryInput & {
  change_id: string
  generation: string
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

/** Drains a bounded, oldest-first durable outbox; stale change acknowledgements retain new work. */
export async function reconcileRssFeedItemCategorySnapshots(
  CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE = getRssFeedItemsWorkLimit(
    'category_snapshot_reconciliation_batch_size',
  ),
  rssFeedItemIds?: readonly string[],
): Promise<{ reconciled: number }> {
  if (rssFeedItemIds?.length === 0) return { reconciled: 0 }
  const { rows } = await write<RssFeedItemCategorySnapshotReconciliation>(
    `/* reconcileRssFeedItemCategorySnapshots */
      SELECT rss_feed_item_id, categories, generation, change_id
      FROM rss_feed_item_category_snapshot_reconciliations
      ${rssFeedItemIds ? 'WHERE rss_feed_item_id = ANY($2::uuid[])' : ''}
      ORDER BY updated_at, rss_feed_item_id
      LIMIT $1`,
    rssFeedItemIds
      ? [CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE, rssFeedItemIds]
      : [CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE],
  )
  return reconcileRssFeedItemCategorySnapshotRows(rows)
}

/** Applies selected rows independently so one poison snapshot does not starve its batch peers. */
async function reconcileRssFeedItemCategorySnapshotRows(
  rows: readonly RssFeedItemCategorySnapshotReconciliation[],
): Promise<{ reconciled: number }> {
  let reconciled = 0
  const errors: unknown[] = []
  for (const row of rows) {
    try {
      assertCategorySnapshot(row)
      // eslint-disable-next-line no-await-in-loop -- one completed result serializes each item.
      const current = await upsertRssFeedItemCategories([row], row)
      if (!current) {
        // A newer generation replaced this selected row. Count the scanned slot so a full
        // bounded page schedules its continuation, which will select that newer generation.
        reconciled += 1
        continue
      }
      // Keep notification eligibility in step with the durable category projection. The snapshot
      // remains pending if this enqueue fails, so the next reconciliation retries both the
      // notification prompt and its exact-generation acknowledgement.
      // eslint-disable-next-line no-await-in-loop -- each snapshot must enqueue before its own acknowledgement.
      await enqueueBulkReconcileRssFeedItemNotifications([row.rss_feed_item_id], row.change_id)
      // eslint-disable-next-line no-await-in-loop -- a compare-and-delete must follow this item only.
      await acknowledgeRssFeedItemCategorySnapshot(row)
      reconciled += 1
    } catch (err) {
      errors.push(err)
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

async function acknowledgeRssFeedItemCategorySnapshot(
  snapshot: RssFeedItemCategorySnapshotReconciliation,
): Promise<void> {
  await write(
    `/* acknowledgeRssFeedItemCategorySnapshot */
      DELETE FROM rss_feed_item_category_snapshot_reconciliations
      WHERE rss_feed_item_id = $1::uuid AND generation = $2::bigint AND change_id = $3::uuid
      RETURNING rss_feed_item_id`,
    [snapshot.rss_feed_item_id, snapshot.generation, snapshot.change_id],
  )
}
