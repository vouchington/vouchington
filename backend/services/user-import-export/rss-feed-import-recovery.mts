import { write } from '@data-stores/psql'
import {
  IMPORT_RECOVERY_BATCH_SIZE,
  IMPORT_RECOVERY_STALE_MS,
} from '@queues/user-rss-feed-imports/config'
import { enqueueUserRssFeedImportDispatch } from '@queues/user-rss-feed-imports/enqueues'
import sql from 'sql-template-strings'

type RecoveryOptions = {
  /** How long an unfinished import may make no progress before it is re-dispatched. */
  staleAfterMs?: number
  enqueueDispatch?: typeof enqueueUserRssFeedImportDispatch
}

/**
 * Re-dispatches unfinished imports whose progress stopped, for example because their dispatcher
 * failed every attempt and was removed. The dispatcher job id and the row deduplication ids make
 * the re-dispatch safe to repeat. Every import it dispatches is marked as just touched, so the next
 * sweep leaves it alone until it stalls again. Returns how many imports it re-dispatched.
 */
export async function recoverStalledUserRssFeedImports(
  options: RecoveryOptions = {},
): Promise<number> {
  const { staleAfterMs = IMPORT_RECOVERY_STALE_MS, enqueueDispatch } = options
  const enqueue = enqueueDispatch ?? enqueueUserRssFeedImportDispatch

  // The primary: a lagging replica must not report an import stalled that just made progress.
  const { rows } = await write<{ id: string }>(
    sql`/* readStalledUserRssFeedImports */
      SELECT id
      FROM user_rss_feed_import_batches
      WHERE completed_at IS NULL
        AND updated_at < CURRENT_TIMESTAMP - make_interval(secs => ${staleAfterMs / 1000})
      ORDER BY updated_at
      LIMIT ${IMPORT_RECOVERY_BATCH_SIZE}
    `,
  )
  if (rows.length === 0) return 0

  const ids = rows.map(row => row.id)
  // The marker follows the enqueue: a crash between them only repeats an idempotent dispatch.
  await Promise.all(ids.map(id => enqueue(id)))
  await write(
    sql`/* markStalledUserRssFeedImportsRecovered */
      UPDATE user_rss_feed_import_batches
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY(${ids}::uuid[])
        AND completed_at IS NULL
    `,
  )
  return ids.length
}
