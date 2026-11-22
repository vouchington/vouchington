import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { cleanupCompletedImportBatches } from '../services/data-retention/cleanup-import-batches.mts'

/** Keep one completed parent under a competing write while a retention page runs. */
export async function lockTestCompletedAdminImportBatch(
  holder: TransactionQuery,
  batchId: string,
): Promise<void> {
  await holder(sql`/* lockTestCompletedAdminImportBatch */
    SELECT id FROM admin_import_batches WHERE id = ${batchId} FOR UPDATE`)
}

/** Race a resumed page with a child purge that already owns the parent. */
export async function raceImportRetentionPageWithChildPurge(
  batchId: string,
  options: Parameters<typeof cleanupCompletedImportBatches>[1],
) {
  await using holder = await beginTransaction()
  await lockTestCompletedAdminImportBatch(holder, batchId)
  await holder(sql`/* purgeRemainingTestAdminImportRows */
    DELETE FROM admin_import_rows WHERE batch_id = ${batchId}`)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'lockCurrentImportRetentionBatch',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForParent => {
      const page = cleanupCompletedImportBatches('admin', options)
      await waitForParent(page)
      await holder.commit()
      return page
    },
  )
}
