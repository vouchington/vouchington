import { write } from '@data-stores/psql'
import { IMPORT_RECOVERY_BATCH_SIZE, IMPORT_RECOVERY_STALE_MS } from '@queues/admin-imports/config'
import { enqueueAdminTopicImportDispatch } from '@queues/admin-imports/enqueues'
import sql from 'sql-template-strings'

type RecoveryOptions = {
  /** How long an unfinished batch may make no progress before it is re-dispatched. */
  staleAfterMs?: number
  enqueueDispatch?: typeof enqueueAdminTopicImportDispatch
}

/**
 * Re-dispatches unfinished topic import batches whose progress stopped, for example because their
 * dispatcher failed every attempt and was removed. See `recoverStalledUserRssFeedImports`, which
 * works the same way. Returns how many batches it re-dispatched.
 */
export async function recoverStalledAdminTopicImports(
  options: RecoveryOptions = {},
): Promise<number> {
  const { staleAfterMs = IMPORT_RECOVERY_STALE_MS, enqueueDispatch } = options
  const enqueue = enqueueDispatch ?? enqueueAdminTopicImportDispatch

  const { rows } = await write<{ id: string }>(
    sql`/* readStalledAdminTopicImports */
      SELECT id
      FROM admin_import_batches
      WHERE import_type = 'topic'
        AND completed_at IS NULL
        AND updated_at < CURRENT_TIMESTAMP - make_interval(secs => ${staleAfterMs / 1000})
      ORDER BY updated_at
      LIMIT ${IMPORT_RECOVERY_BATCH_SIZE}
    `,
  )
  if (rows.length === 0) return 0

  const ids = rows.map(row => row.id)
  await Promise.all(ids.map(id => enqueue(id)))
  await write(
    sql`/* markStalledAdminTopicImportsRecovered */
      UPDATE admin_import_batches
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY(${ids}::uuid[])
        AND completed_at IS NULL
    `,
  )
  return ids.length
}
