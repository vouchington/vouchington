import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from '../postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'

export type TestRssFeedItemCategorySnapshotReconciliation = {
  rss_feed_item_id: string
  change_id: string
  categories: unknown
  generation: string
  updated_at: Date
}

export async function getTestRssFeedItemCategoryProjectionResult(
  rssFeedItemId: string,
): Promise<
  | { rss_feed_item_id: string; change_id: string; categories: string[]; completed_at: Date }
  | undefined
> {
  const { rows } = await read<{
    rss_feed_item_id: string
    change_id: string
    categories: string[]
    completed_at: Date
  }>(sql`
    /* getTestRssFeedItemCategoryProjectionResult */
    SELECT rss_feed_item_id, change_id, categories, completed_at
    FROM rss_feed_item_category_projection_results
    WHERE rss_feed_item_id = ${rssFeedItemId}
  `)
  return rows[0]
}

/** Hold only this test's completed-result row while a reconciler reaches its real UPSERT. */
export async function withHeldCategoryProjectionResultForTest<Result>(
  rssFeedItemId: string,
  operation: () => Promise<Result>,
  whileWaiting: () => Promise<void>,
): Promise<Result> {
  await using holder = await beginTransaction()
  await holder(sql`
    /* holdCategoryProjectionResultForTest */
    UPDATE rss_feed_item_category_projection_results SET completed_at = clock_timestamp()
    WHERE rss_feed_item_id = ${rssFeedItemId}
  `)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'job-serialization',
      lock: { kind: 'transaction' },
      queryMarker: 'claimCategoryProjectionResults',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      await whileWaiting()
      await holder.commit()
      return pending
    },
  )
}

export async function getTestRssFeedItemCategorySnapshotReconciliation(
  rssFeedItemId: string,
): Promise<TestRssFeedItemCategorySnapshotReconciliation | undefined> {
  const { rows } = await read<TestRssFeedItemCategorySnapshotReconciliation>(sql`
    /* getTestRssFeedItemCategorySnapshotReconciliation */
    SELECT rss_feed_item_id, categories, generation, change_id, updated_at
    FROM rss_feed_item_category_snapshot_reconciliations
    WHERE rss_feed_item_id = ${rssFeedItemId}
  `)
  return rows[0]
}

export async function listTestRssFeedItemCategorySnapshotReconciliations(
  rssFeedItemIds: string[],
): Promise<TestRssFeedItemCategorySnapshotReconciliation[]> {
  if (rssFeedItemIds.length === 0) return []
  const { rows } = await read<TestRssFeedItemCategorySnapshotReconciliation>(sql`
    /* listTestRssFeedItemCategorySnapshotReconciliations */
    SELECT rss_feed_item_id, categories, generation, change_id, updated_at
    FROM rss_feed_item_category_snapshot_reconciliations
    WHERE rss_feed_item_id = ANY(${rssFeedItemIds}::uuid[])
    ORDER BY updated_at, rss_feed_item_id
  `)
  return rows
}

export async function replaceTestRssFeedItemCategorySnapshotReconciliation(
  rssFeedItemId: string,
  categories: unknown,
): Promise<void> {
  await write(sql`
    /* replaceTestRssFeedItemCategorySnapshotReconciliation */
    INSERT INTO rss_feed_item_category_snapshot_reconciliations
      (rss_feed_item_id, categories)
    VALUES (${rssFeedItemId}, ${JSON.stringify(categories)}::jsonb)
    ON CONFLICT (rss_feed_item_id) DO UPDATE
    SET categories = EXCLUDED.categories,
        generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
        change_id = uuidv7()
  `)
}
