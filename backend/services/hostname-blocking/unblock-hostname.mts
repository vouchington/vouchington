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
    await lockHostnameForUnblock(query, hostnameId)
    const { rows: introducedRows } = await query(sql`/* unblockHostname:introduce */
      UPDATE url_hostnames
      SET publicly_introduced_at = CURRENT_TIMESTAMP
      WHERE id = ${hostnameId} AND publicly_introduced_at IS NULL
      RETURNING id
    `)
    return liftStaffBlocksAndEnqueue(query, adminUserId, hostnameId, introducedRows.length > 0)
  }
  const changed =
    options.query || options.client
      ? await withTransactionOptions(options, run)
      : await unblockHostnameInOwnedTransaction(run)

  if (changed && !options.query && !options.client)
    await drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] }).catch(onError)
}

async function lockHostnameForUnblock(query: TransactionQuery, hostnameId: string): Promise<void> {
  await query(sql`/* unblockHostname:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${hostnameId}, 0))
  `)
  // Match the block flow's hostname-before-block-row order.
  await query(sql`/* unblockHostname:lockHostname */
    SELECT id FROM url_hostnames WHERE id = ${hostnameId} FOR UPDATE
  `)
}

async function liftStaffBlocksAndEnqueue(
  query: TransactionQuery,
  adminUserId: string,
  hostnameId: string,
  introduced: boolean,
): Promise<boolean> {
  const { rows: updateRows } = await query(sql`/* unblockHostname */
    UPDATE url_hostname_blocks
    SET lifted_at = CURRENT_TIMESTAMP,
        lifted_by_id = ${adminUserId}
    WHERE url_hostname_id = ${hostnameId}
      AND lifted_at IS NULL
      AND domain_blocklist_source_id IS NULL  -- feed-owned blocks lift only when their source row is removed
    RETURNING url_hostname_id
  `)
  const changed = introduced || updateRows.length > 0
  if (changed) await enqueueHostnameCacheInvalidation(query, [hostnameId])
  return changed
}

async function unblockHostnameInOwnedTransaction(
  run: (query: TransactionQuery) => Promise<boolean>,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
