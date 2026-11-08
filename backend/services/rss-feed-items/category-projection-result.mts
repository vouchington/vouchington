import { v7 as uuidv7 } from 'uuid'
import { beginTransaction, jobSerializationPool, type TransactionQuery } from '@data-stores/psql'
import {
  normalizeRssFeedItemCategorySnapshots,
  type RssFeedItemCategorySnapshot,
} from './category-batches.mts'
import { getRssFeedItemCategorySnapshots } from './source-category-union.mts'

export type PendingRssFeedItemCategorySnapshot = RssFeedItemCategorySnapshot & {
  change_id: string
  generation: string
}

/** The result row is an actual completion record and serializes the whole awaited projection. */
export async function applyRssFeedItemCategorySnapshots(
  requestedSnapshots: RssFeedItemCategorySnapshot[],
  project: (snapshots: RssFeedItemCategorySnapshot[]) => Promise<void>,
  pending?: PendingRssFeedItemCategorySnapshot,
): Promise<boolean> {
  const orderedSnapshots = [...requestedSnapshots].toSorted((left, right) =>
    left.rss_feed_item_id.localeCompare(right.rss_feed_item_id),
  )
  const changeIds = new Map(
    orderedSnapshots.map(snapshot => [snapshot.rss_feed_item_id, pending?.change_id ?? uuidv7()]),
  )
  // The awaited category pipeline opens its own writer transactions. Keep this long-lived
  // completion transaction off the write pool so concurrent claims cannot starve that work.
  await using resultQuery = await beginTransaction({ client: jobSerializationPool })
  const claimed = await claimCategoryProjectionResults(resultQuery, orderedSnapshots, changeIds)
  if (claimed !== orderedSnapshots.length) {
    if (!pending) throw new Error('Direct category projection reused a change identity')
    // A prior notification enqueue or ack may have failed after projection completed.
    return await isPendingCategorySnapshotCurrent(resultQuery, pending)
  }

  let snapshots = orderedSnapshots
  if (pending) {
    if (!(await isPendingCategorySnapshotCurrent(resultQuery, pending))) return false
    const activeSources = await getRssFeedItemCategorySnapshots([pending.rss_feed_item_id])
    snapshots = normalizeRssFeedItemCategorySnapshots([
      {
        rss_feed_item_id: pending.rss_feed_item_id,
        categories: activeSources.get(pending.rss_feed_item_id) ?? [],
      },
    ])
  }

  await project(snapshots)
  await completeCategoryProjectionResults(resultQuery, snapshots, changeIds)
  await resultQuery.commit()
  return true
}

async function claimCategoryProjectionResults(
  query: TransactionQuery,
  snapshots: RssFeedItemCategorySnapshot[],
  changeIds: ReadonlyMap<string, string>,
): Promise<number> {
  const input = projectionInput(snapshots, changeIds)
  const { rowCount } = await query(
    `/* claimCategoryProjectionResults */
      INSERT INTO rss_feed_item_category_projection_results
        (rss_feed_item_id, change_id, categories, completed_at)
      SELECT input.rss_feed_item_id, input.change_id, input.categories, clock_timestamp()
      FROM (VALUES ${input.tuples}) AS input(rss_feed_item_id, change_id, categories)
      ORDER BY input.rss_feed_item_id
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET change_id = EXCLUDED.change_id,
          categories = EXCLUDED.categories,
          completed_at = EXCLUDED.completed_at
      WHERE rss_feed_item_category_projection_results.change_id IS DISTINCT FROM EXCLUDED.change_id
      RETURNING rss_feed_item_id`,
    input.values,
  )
  return rowCount ?? 0
}

async function isPendingCategorySnapshotCurrent(
  query: TransactionQuery,
  pending: PendingRssFeedItemCategorySnapshot,
): Promise<boolean> {
  const { rowCount } = await query(
    `/* isPendingCategorySnapshotCurrent */
      SELECT 1 FROM rss_feed_item_category_snapshot_reconciliations
      WHERE rss_feed_item_id = $1::uuid AND generation = $2::bigint AND change_id = $3::uuid`,
    [pending.rss_feed_item_id, pending.generation, pending.change_id],
  )
  return (rowCount ?? 0) > 0
}

async function completeCategoryProjectionResults(
  query: TransactionQuery,
  snapshots: RssFeedItemCategorySnapshot[],
  changeIds: ReadonlyMap<string, string>,
): Promise<void> {
  const input = projectionInput(snapshots, changeIds)
  const { rowCount } = await query(
    `/* completeCategoryProjectionResults */
      UPDATE rss_feed_item_category_projection_results result
      SET categories = input.categories, completed_at = clock_timestamp()
      FROM (VALUES ${input.tuples}) AS input(rss_feed_item_id, change_id, categories)
      WHERE result.rss_feed_item_id = input.rss_feed_item_id AND result.change_id = input.change_id
      RETURNING result.rss_feed_item_id`,
    input.values,
  )
  if (rowCount !== snapshots.length)
    throw new Error('Category projection result changed before completion')
}

/** VALUES preserves the finite input cardinality for both custom and generic plans. */
function projectionInput(
  snapshots: readonly RssFeedItemCategorySnapshot[],
  changeIds: ReadonlyMap<string, string>,
): { tuples: string; values: unknown[] } {
  const values: unknown[] = []
  const tuples = snapshots.map((snapshot, index) => {
    values.push(
      snapshot.rss_feed_item_id,
      changeIds.get(snapshot.rss_feed_item_id),
      JSON.stringify(snapshot.categories),
    )
    const offset = index * 3
    return `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::jsonb)`
  })
  return { tuples: tuples.join(', '), values }
}
