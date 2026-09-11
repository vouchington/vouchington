import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueBulkRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { insertVoteWeightPenalty } from '@services/vote-integrity/insert-vote-weight-penalty'
import { softDeleteBlockedHostnameRelations } from './soft-delete-relations.mts'

export type BlockHostnameResult = {
  blocked_hostname_count: number
  soft_deleted_relation_count: number
  penalized_user_count: number
}

export type BlockHostnameOptions = QueryOptions & {
  blockedSource?: string
  penalizeCreators?: boolean
  webRiskCheckedUrl?: string
  webRiskThreatTypes?: string[]
  webRiskExpireAt?: string | null
}

type BlockedHostname = {
  id: string
  hostname: string
}

export async function blockHostname(
  adminUserId: string,
  hostnameId: string,
  options: BlockHostnameOptions = {},
): Promise<BlockHostnameResult> {
  const run = (query: TransactionQuery) =>
    blockHostnameWithQuery(adminUserId, hostnameId, query, options)
  const txResult =
    options.query || options.client
      ? await withTransactionOptions(options, run)
      : await blockHostnameInOwnedTransaction(run)

  if (!options.query) {
    await invalidate.url_hostnames(...txResult.hostnames)
  }

  if (options.penalizeCreators !== false) {
    void enqueueBulkRecalculateUserVoteWeight(txResult.creatorIds, true)
  }

  return toBlockHostnameResult(txResult)
}

async function blockHostnameInOwnedTransaction(
  run: (query: TransactionQuery) => ReturnType<typeof blockHostnameWithQuery>,
): Promise<Awaited<ReturnType<typeof blockHostnameWithQuery>>> {
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
): Promise<{ result: BlockHostnameResult; hostnames: BlockedHostname[]; creatorIds: string[] }> {
  const txResult = await blockHostnameWithQuery(adminUserId, hostnameId, query, options)

  return {
    result: toBlockHostnameResult(txResult),
    hostnames: txResult.hostnames,
    creatorIds: txResult.creatorIds,
  }
}

export function enqueueBlockHostnameVoteWeightRecalculation(creatorIds: string[]): void {
  void enqueueBulkRecalculateUserVoteWeight(creatorIds, true)
}

async function blockHostnameWithQuery(
  adminUserId: string,
  hostnameId: string,
  query: TransactionQuery,
  options: BlockHostnameOptions,
) {
  const { rows: hostnameRows } = await query(sql`/* blockHostname_lockAndGetHostname */
      SELECT pg_advisory_xact_lock(hashtextextended(${hostnameId}, 0)), hostname
      FROM url_hostnames WHERE id = ${hostnameId}
    `)
  const targetHostname = (hostnameRows[0] as { hostname: string } | undefined)?.hostname
  if (!targetHostname) throw createHttpError(404, 'Hostname not found')
  const escapedForLike = targetHostname.replace(/[%_\\]/g, char => `\\${char}`)
  const subdomainPattern = `%.${escapedForLike}`

  await query(sql`/* blockHostname_blockTarget */
      INSERT INTO url_hostname_blocks (url_hostname_id, blocked_by_id, blocked_source)
      SELECT ${hostnameId}, ${adminUserId}, ${options.blockedSource ?? 'admin'}
      WHERE NOT EXISTS (
        SELECT 1 FROM url_hostname_blocks
        WHERE url_hostname_id = ${hostnameId}
          AND lifted_at IS NULL
      )
    `)
  // Also update web_risk tracking columns on the hostname row itself (non-history metadata)
  if (
    options.webRiskCheckedUrl !== undefined ||
    options.webRiskThreatTypes !== undefined ||
    options.webRiskExpireAt !== undefined
  ) {
    await query(sql`/* blockHostname_updateWebRiskMeta */
        UPDATE url_hostnames
        SET
          web_risk_checked_url = ${options.webRiskCheckedUrl ?? null},
          web_risk_threat_types = ${options.webRiskThreatTypes ?? null}::text[],
          web_risk_expire_at = ${options.webRiskExpireAt ?? null}
        WHERE id = ${hostnameId}
      `)
  }

  await query(sql`/* blockHostname_blockSubdomains */
      INSERT INTO url_hostname_blocks (url_hostname_id, blocked_by_id, blocked_source)
      SELECT id, ${adminUserId}, ${options.blockedSource ?? 'admin'}
      FROM url_hostnames
      WHERE hostname LIKE ${subdomainPattern} ESCAPE '\'
        AND NOT EXISTS (
          SELECT 1 FROM url_hostname_blocks
          WHERE url_hostname_id = url_hostnames.id
            AND lifted_at IS NULL
        )
    `)

  const { rows: hostnameRowsForInvalidation } = await query(sql`/* blockHostname_getHostnames */
      SELECT id, hostname FROM url_hostnames
      WHERE hostname = ${targetHostname}
        OR hostname LIKE ${subdomainPattern} ESCAPE '\'
    `)
  const hostnames = hostnameRowsForInvalidation as BlockedHostname[]
  const hostnameIds = hostnames.map(r => r.id)

  // Relation tables come from trusted hard-coded metadata, not user input.
  let { creatorIds, totalDeleted } = await softDeleteBlockedHostnameRelations(
    adminUserId,
    hostnameIds,
    query,
  )

  let penalizedCount = 0
  if (creatorIds.length > 0 && options.penalizeCreators !== false) {
    creatorIds = await insertVoteWeightPenalty({
      userIds: creatorIds,
      reason: 'blocked_hostname',
      sourceHostnameId: hostnameId,
      createdById: adminUserId,
      query,
      enqueueRecalculation: false,
    })
    penalizedCount = creatorIds.length
  }

  return {
    hostnames,
    totalDeleted,
    creatorIds,
    penalizedCount,
  }
}

function toBlockHostnameResult(txResult: Awaited<ReturnType<typeof blockHostnameWithQuery>>) {
  return {
    blocked_hostname_count: txResult.hostnames.length,
    soft_deleted_relation_count: txResult.totalDeleted,
    penalized_user_count: txResult.penalizedCount,
  }
}
