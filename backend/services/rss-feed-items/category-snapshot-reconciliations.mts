import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import { write, type QueryExecutor } from '@data-stores/psql'
import { enqueueBulkReconcileRssFeedItemNotifications } from '@queues/notifications/enqueues'
import { upsertRssFeedItemCategories, type RssFeedItemCategoryInput } from './categories.mts'

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
          generation = rss_feed_item_category_snapshot_reconciliations.generation + 1`,
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
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1`,
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
      SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1`,
    [rssFeedId],
  )
}

/** Drains a bounded, oldest-first durable outbox; stale generation acknowledgements retain new work. */
export async function reconcileRssFeedItemCategorySnapshots(
  CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE = getRssFeedItemsWorkLimit(
    'category_snapshot_reconciliation_batch_size',
  ),
  rssFeedItemIds?: readonly string[],
): Promise<{ reconciled: number }> {
  if (rssFeedItemIds?.length === 0) return { reconciled: 0 }
  const { rows } = await write<RssFeedItemCategorySnapshotReconciliation>(
    `/* reconcileRssFeedItemCategorySnapshots */
      SELECT rss_feed_item_id, categories, generation
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
export async function reconcileRssFeedItemCategorySnapshotRows(
  rows: readonly RssFeedItemCategorySnapshotReconciliation[],
): Promise<{ reconciled: number }> {
  let reconciled = 0
  const errors: unknown[] = []
  const categorySnapshots = await getRssFeedItemCategorySnapshots(
    rows.map(row => row.rss_feed_item_id),
  )
  for (const row of rows) {
    try {
      assertCategorySnapshot(row)
      // eslint-disable-next-line no-await-in-loop -- complete one snapshot before its exact-generation acknowledgement.
      await upsertRssFeedItemCategories([
        {
          rss_feed_item_id: row.rss_feed_item_id,
          categories: categorySnapshots.get(row.rss_feed_item_id) ?? [],
        },
      ])
      // Keep notification eligibility in step with the durable category projection. The snapshot
      // remains pending if this enqueue fails, so the next reconciliation retries both the
      // notification prompt and its exact-generation acknowledgement.
      // eslint-disable-next-line no-await-in-loop -- each snapshot must enqueue before its own acknowledgement.
      await enqueueBulkReconcileRssFeedItemNotifications([row.rss_feed_item_id])
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

async function getRssFeedItemCategorySnapshots(
  rssFeedItemIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (rssFeedItemIds.length === 0) return new Map()
  const { rows } = await write<{ rss_feed_item_id: string; categories: string[] }>(
    `/* getRssFeedItemCategorySnapshots */
      SELECT source_snapshot.rss_feed_item_id,
             ARRAY_AGG(DISTINCT source_category.category_text ORDER BY source_category.category_text)
               AS categories
      FROM rss_feed_item_source_category_snapshots source_snapshot
      JOIN rss_feed_item_sources source
        ON source.rss_feed_id = source_snapshot.rss_feed_id
       AND source.rss_feed_item_id = source_snapshot.rss_feed_item_id
      JOIN rss_feeds feed ON feed.id = source.rss_feed_id
      CROSS JOIN LATERAL jsonb_array_elements_text(source_snapshot.categories)
        AS source_category(category_text)
      WHERE source_snapshot.rss_feed_item_id = ANY($1::uuid[])
        AND feed.deleted_at IS NULL
      GROUP BY source_snapshot.rss_feed_item_id`,
    [rssFeedItemIds],
  )
  return new Map(rows.map(row => [row.rss_feed_item_id, row.categories]))
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
