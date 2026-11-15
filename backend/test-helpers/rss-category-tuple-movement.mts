import { beginTransaction } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Move an owned category tuple after a stale-delete statement has captured its original ctid. */
export async function moveRssCategoryTupleDuringDeletion<Result>(
  itemId: string,
  categoryText: string,
  project: () => Promise<Result>,
): Promise<Result> {
  await using holder = await beginTransaction()
  const moved = await holder(
    `/* moveRssCategoryTupleDuringDeletion */
      SELECT rss_feed_item_id FROM rss_feed_item_categories
      WHERE rss_feed_item_id = $1::uuid AND category_text = $2 FOR UPDATE`,
    [itemId, categoryText],
  )
  if (moved.rowCount !== 1)
    throw new Error(`Expected one owned category tuple, got ${moved.rowCount}`)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'reconcileRssFeedItemCategorySnapshots',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = project()
      await waitForLock(pending)
      await holder(
        `/* moveRssCategoryTupleDuringDeletion:move */
        UPDATE rss_feed_item_categories SET updated_at = clock_timestamp()
        WHERE rss_feed_item_id = $1::uuid AND category_text = $2`,
        [itemId, categoryText],
      )
      await holder.commit()
      return pending
    },
  )
}
