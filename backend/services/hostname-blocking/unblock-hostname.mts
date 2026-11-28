import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { getHostnameBlockingWorkLimit } from './work-limits.mts'

export async function unblockHostname(
  adminUserId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<void> {
  const run = async (query: TransactionQuery) => {
    if (!(await lockHostnameForUnblock(query, hostnameId))) return false
    await assertHostnameCleanupCompletedForUnblock(query, hostnameId)
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

async function assertHostnameCleanupCompletedForUnblock(
  query: TransactionQuery,
  hostnameId: string,
): Promise<void> {
  const { rows } = await query(sql`/* unblockHostname:pendingCleanup */
    SELECT cleanup_root.id
    FROM url_hostname_blocks active_block
    JOIN url_hostname_blocks cleanup_root
      ON cleanup_root.id = active_block.relation_cleanup_root_block_id
    WHERE active_block.url_hostname_id = ${hostnameId}
      AND active_block.lifted_at IS NULL
      AND active_block.domain_blocklist_source_id IS NULL
      AND cleanup_root.relation_cleanup_completed_at IS NULL
    LIMIT 1
  `)
  if (rows.length > 0)
    throw createHttpError(
      409,
      'Hostname cleanup is still in progress. Try unblocking again after it completes.',
    )
}

async function lockHostnameForUnblock(
  query: TransactionQuery,
  hostnameId: string,
): Promise<boolean> {
  // Writes must follow admission's hostname-before-block order because lifting a staff
  // block can update the hostname's projected state.
  const { rows } = await query(sql`/* unblockHostname:lockHostname */
    SELECT hostname.id FROM url_hostnames hostname
    WHERE hostname.id = ${hostnameId}
      AND (hostname.publicly_introduced_at IS NULL OR EXISTS (
        SELECT 1 FROM url_hostname_blocks block
        WHERE block.url_hostname_id = hostname.id
          AND block.lifted_at IS NULL AND block.domain_blocklist_source_id IS NULL
      ))
    FOR UPDATE OF hostname
  `)
  return rows.length !== 0
}

async function liftStaffBlocksAndEnqueue(
  query: TransactionQuery,
  adminUserId: string,
  hostnameId: string,
  introduced: boolean,
): Promise<boolean> {
  const batchSize = getHostnameBlockingWorkLimit('hostname_scan_batch_size')
  let lifted = false
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch UPDATE lifts active staff blocks for this locked hostname
    // no-mistakes-disable-next-line query-reached-per-item: batched UPDATE lifting active staff blocks in DynamicConfig hostname_scan_batch_size pages (hard max 5000)
    const { rows: updateRows } = await query(
      sql`/* unblockHostname */
      WITH target AS (
        SELECT id
        FROM url_hostname_blocks
        WHERE url_hostname_id = ${hostnameId}
          AND lifted_at IS NULL
          AND domain_blocklist_source_id IS NULL  -- feed-owned blocks lift only when their source row is removed
        ORDER BY id
        LIMIT ${batchSize}
      )
      UPDATE url_hostname_blocks block
      SET lifted_at = CURRENT_TIMESTAMP,
          lifted_by_id = ${adminUserId}
      FROM target
      WHERE block.id = target.id
      RETURNING block.url_hostname_id
    `,
    )
    // oxlint-enable no-await-in-loop
    if (updateRows.length > 0) lifted = true
    if (updateRows.length < batchSize) break
  }
  const changed = introduced || lifted
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
