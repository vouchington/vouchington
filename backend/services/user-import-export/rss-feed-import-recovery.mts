import { write } from '@data-stores/psql'
import { IMPORT_RECOVERY_STALE_MS } from '@queues/user-rss-feed-imports/config'
import { enqueueUserRssFeedImportDispatches } from '@queues/user-rss-feed-imports/enqueues'
import sql from 'sql-template-strings'
import { getUserImportExportConfig } from './config.mts'

type RecoveryOptions = {
  /** How long an unfinished import may make no progress before it is re-dispatched. */
  staleAfterMs?: number
  enqueueDispatches?: (importIds: string[]) => Promise<unknown>
}

/**
 * Re-dispatches unfinished imports whose recovery marker is stale, for example because their
 * dispatcher failed every attempt and was removed. The dispatcher job id and row deduplication ids make
 * the re-dispatch safe to repeat. Every import it dispatches is marked as just touched, so the next
 * sweep leaves it alone until it stalls again. Returns how many imports it re-dispatched.
 */
export async function recoverStalledUserRssFeedImports(
  options: RecoveryOptions = {},
): Promise<number> {
  const { staleAfterMs = IMPORT_RECOVERY_STALE_MS, enqueueDispatches } = options
  const enqueue = enqueueDispatches ?? enqueueUserRssFeedImportDispatches

  // The primary: inspect only the bounded oldest set of stale batch markers.
  const { rows } = await write<{
    id: string
    has_pending_rows: boolean
  }>(sql`/* readStalledUserRssFeedImports */
      SELECT batch.id, EXISTS (
        SELECT 1 FROM user_rss_feed_import_rows pending
        WHERE pending.batch_id = batch.id AND pending.outcome IS NULL
      ) AS has_pending_rows
      FROM user_rss_feed_import_batches batch
      WHERE batch.completed_at IS NULL
        AND batch.updated_at < CURRENT_TIMESTAMP - make_interval(secs => ${staleAfterMs / 1000})
      ORDER BY batch.updated_at
      LIMIT ${getUserImportExportConfig().import_recovery_batch_size}
    `)
  if (rows.length === 0) return 0

  const completedIds: string[] = []
  const ids: string[] = []
  for (const row of rows) {
    if (row.has_pending_rows) ids.push(row.id)
    else completedIds.push(row.id)
  }
  if (completedIds.length > 0) {
    // A crash after the final row commits can leave the completion marker unset.
    await completeStalledUserRssFeedImports(completedIds)
  }
  if (ids.length === 0) return 0
  // The marker follows the enqueue: a crash between them only repeats an idempotent dispatch.
  // The no-op write fires the `updated_at` trigger, which is what marks the import as just touched.
  await enqueue(ids)
  await write(
    sql`/* markStalledUserRssFeedImportsRecovered */
      UPDATE user_rss_feed_import_batches
      SET total_rows = total_rows
      WHERE id = ANY(${ids}::uuid[])
        AND completed_at IS NULL
    `,
  )
  return ids.length
}

async function completeStalledUserRssFeedImports(completedIds: string[]): Promise<void> {
  await write(sql`/* completeStalledUserRssFeedImports */
    UPDATE user_rss_feed_import_batches batch
    SET completed_at = CURRENT_TIMESTAMP
    WHERE batch.id = ANY(${completedIds}::uuid[])
      AND batch.completed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_rss_feed_import_rows pending
        WHERE pending.batch_id = batch.id AND pending.outcome IS NULL
      )
  `)
}
