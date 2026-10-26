import {
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
} from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import onError from '@modules/on-error'
import { enqueueOrReactivateHostnameBlockCleanups } from '@queues/background/enqueues/hostname-blocking'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import {
  ensureHostnameBlockCleanupOperation,
  toHostnameBlockOperationResult,
  type HostnameBlockOperationResult,
} from './cleanup-operation.mts'

export type BlockHostnameResult = HostnameBlockOperationResult

export type BlockHostnameOptions = QueryOptions & {
  blockedSource?: string
  penalizeCreators?: boolean
  webRiskCheckedUrl?: string
  webRiskThreatTypes?: string[]
  webRiskExpireAt?: string | null
}

export async function blockHostname(
  adminUserId: string,
  hostnameId: string,
  options: BlockHostnameOptions = {},
): Promise<BlockHostnameResult> {
  const run = (query: TransactionQuery) =>
    blockHostnameInTransaction(adminUserId, hostnameId, query, options)
  if (options.query || options.client) return withTransactionOptions(options, run)

  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

export async function blockHostnameInTransaction(
  adminUserId: string,
  hostnameId: string,
  query: TransactionQuery,
  options: BlockHostnameOptions = {},
): Promise<BlockHostnameResult> {
  const { rows } = await query<{ hostname: string }>(sql`/* blockHostname_lockAndGetHostname */
    SELECT hostname, pg_advisory_xact_lock(hashtextextended(${hostnameId}, 0))
    FROM url_hostnames WHERE id = ${hostnameId}
    FOR NO KEY UPDATE
  `)
  if (!rows[0]) throw createHttpError(404, 'Hostname not found')

  await query(sql`/* blockHostname_introduceTarget */
    UPDATE url_hostnames
    SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
    WHERE id = ${hostnameId}
  `)

  const operation = await ensureHostnameBlockCleanupOperation(
    query,
    hostnameId,
    adminUserId,
    options.blockedSource ?? 'admin',
    options.penalizeCreators !== false,
  )

  if (
    options.webRiskCheckedUrl !== undefined ||
    options.webRiskThreatTypes !== undefined ||
    options.webRiskExpireAt !== undefined
  ) {
    await query(sql`/* blockHostname_updateWebRiskMeta */
      UPDATE url_hostnames
      SET web_risk_checked_url = ${options.webRiskCheckedUrl ?? null},
        web_risk_threat_types = ${options.webRiskThreatTypes ?? null}::text[],
        web_risk_expire_at = ${options.webRiskExpireAt ?? null}
      WHERE id = ${hostnameId}
    `)
  }

  await enqueueHostnameCacheInvalidation(query, [hostnameId])
  registerPostCommitAction(query, async () => {
    await Promise.all([
      drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] }).catch(onError),
      enqueueOrReactivateHostnameBlockCleanups([
        { blockId: operation.blockId, progress: operation.progress },
      ]).catch(onError),
    ])
  })

  return toHostnameBlockOperationResult(operation)
}
