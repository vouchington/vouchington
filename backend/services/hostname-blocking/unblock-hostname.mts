import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'

export async function unblockHostname(
  adminUserId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<void> {
  const run = async (query: TransactionQuery) => {
    await query(sql`/* unblockHostname:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${hostnameId}, 0))
    `)
    const { rows: updateRows } = await query(sql`/* unblockHostname */
      UPDATE url_hostname_blocks
      SET lifted_at = CURRENT_TIMESTAMP,
          lifted_by_id = ${adminUserId}
      WHERE url_hostname_id = ${hostnameId}
        AND lifted_at IS NULL
        AND domain_blocklist_source_id IS NULL  -- feed-owned blocks lift only when their source row is removed
      RETURNING url_hostname_id
    `)
    if (updateRows.length > 0) await enqueueHostnameCacheInvalidation(query, [hostnameId])
    return updateRows
  }
  const rows =
    options.query || options.client
      ? await withTransactionOptions(options, run)
      : await unblockHostnameInOwnedTransaction(run)

  if (rows.length > 0 && !options.query && !options.client)
    await drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] }).catch(onError)
}

async function unblockHostnameInOwnedTransaction(
  run: (query: TransactionQuery) => Promise<unknown[]>,
): Promise<unknown[]> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
