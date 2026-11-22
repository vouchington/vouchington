import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
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

/**
 * Start the competing cascade after the cleanup has read its current parent. Let PostgreSQL
 * decide whether the delete waits on that parent or reaches the cursor's SET NULL trigger.
 */
export async function raceImportRetentionPageWithParentPurge(
  batchId: string,
  options: Parameters<typeof cleanupCompletedImportBatches>[1],
) {
  const readParent = Promise.withResolvers<number>()
  const resumePage = Promise.withResolvers<void>()
  const restore = afterPostgresTransactionQueryForTest(
    'SELECT id FROM admin_import_batches WHERE id = $1 AND completed_at < $2',
    values => values[0] === batchId,
    async query => {
      readParent.resolve(await getTestPostgresBackendProcessId(query))
      await resumePage.promise
    },
  )
  const page = cleanupCompletedImportBatches('admin', options)
  void page
    .then(() => readParent.reject(new Error('Resumed import page did not read its owned parent')))
    .catch(readParent.reject)

  try {
    return await withTestOwnedPostgresWait(
      {
        holderProcessId: await readParent.promise,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'purgeTestAdminImportBatch',
        releaseHolder: () => {
          resumePage.resolve()
          return Promise.resolve()
        },
      },
      async waitForPurge => {
        const purge = (async () => {
          await using query = await beginTransaction()
          await query(sql`/* purgeTestAdminImportBatch */
            DELETE FROM admin_import_batches WHERE id = ${batchId}`)
          await query.commit()
        })()
        await waitForPurge(purge)
        resumePage.resolve()
        const [result] = await Promise.all([page, purge])
        return result
      },
    )
  } finally {
    resumePage.resolve()
    restore()
  }
}
