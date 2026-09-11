import { beginTransaction, withTransactionOptions, read } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'

type BlockedHostname = {
  id: string
  hostname: string
}

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
        AND lifted_at IS NULL  -- intentionally lifts ALL active blocks for this hostname (admin + web_risk + parent_hostname)
      RETURNING url_hostname_id
    `)
    return updateRows
  }
  const rows =
    options.query || options.client
      ? await withTransactionOptions(options, run)
      : await unblockHostnameInOwnedTransaction(run)

  if (rows.length > 0) {
    const { rows: hostnameRows } = await read(
      sql`/* unblockHostname:getHostname */
      SELECT id, hostname FROM url_hostnames WHERE id = ${hostnameId}
    `,
      options,
    )
    if (hostnameRows.length > 0) {
      await invalidate.url_hostnames(hostnameRows[0] as BlockedHostname)
    }
  }
}

async function unblockHostnameInOwnedTransaction(
  run: (query: TransactionQuery) => Promise<unknown[]>,
): Promise<unknown[]> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
