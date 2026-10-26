import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import onError from '@modules/on-error'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import sql from 'sql-template-strings'
import {
  advanceHostnameBlockCleanupProgress,
  getHostnameBlockCleanupOperationInTransaction,
  lockHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import { getPendingDescendantCleanupRootHostnames } from './cleanup-operation-ancestor.mts'
import {
  lockHostnameBlockSubdomainCandidatePage,
  type HostnameCandidate,
} from './lock-subdomain-candidate-page.mts'

export async function projectNextHostnameBlockSubdomainPage(
  blockId: string,
  expectedProgress: number,
  afterReversedHostname: string | undefined,
  limit: number,
): Promise<{
  operation: HostnameBlockCleanupOperation | null
  cursor: HostnameBlockCleanupCursor
  projected: number
}> {
  await using query = await beginTransaction()
  const discovery = await lockSubdomainCandidatePageBeforeOperation(
    query,
    blockId,
    expectedProgress,
    afterReversedHostname,
    limit,
  )
  if (!discovery.candidates) {
    return {
      operation: discovery.operation,
      cursor: { stage: 'subdomains', ...(afterReversedHostname ? { afterReversedHostname } : {}) },
      projected: 0,
    }
  }
  const { candidates } = discovery
  const pendingDescendantRoots = await getPendingDescendantCleanupRootHostnames(
    query,
    blockId,
    candidates.map(candidate => candidate.reversed_hostname),
  )
  const operation = await lockHostnameBlockCleanupOperation(query, blockId)
  if (!operation || operation.completedAt || operation.progress !== expectedProgress) {
    return {
      operation,
      cursor: { stage: 'subdomains', ...(afterReversedHostname ? { afterReversedHostname } : {}) },
      projected: 0,
    }
  }
  const hostnameIds = candidates.flatMap(candidate =>
    candidate.reversed_hostname
      .split('.')
      .some((_, index, labels) => pendingDescendantRoots.has(labels.slice(0, index + 1).join('.')))
      ? []
      : [candidate.id],
  )

  if (hostnameIds.length > 0) {
    await query(sql`/* projectNextHostnameBlockSubdomainPage:introduce */
      UPDATE url_hostnames SET publicly_introduced_at = CURRENT_TIMESTAMP
      WHERE id = ANY(${hostnameIds}::uuid[]) AND publicly_introduced_at IS NULL
    `)
    const { rows: attached } = await query<{ url_hostname_id: string }>(
      sql`/* projectNextHostnameBlockSubdomainPage:attachExisting */
      UPDATE url_hostname_blocks block
      SET relation_cleanup_root_block_id = ${blockId}
      WHERE block.url_hostname_id = ANY(${hostnameIds}::uuid[])
        AND block.lifted_at IS NULL AND block.domain_blocklist_source_id IS NULL
        AND block.relation_cleanup_root_block_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM url_hostname_blocks owner
          WHERE owner.url_hostname_id = block.url_hostname_id
            AND owner.lifted_at IS NULL AND owner.domain_blocklist_source_id IS NULL
            AND owner.relation_cleanup_root_block_id IS NOT NULL
        )
      RETURNING block.url_hostname_id
    `,
    )
    const { rows: inserted } = await query<{ url_hostname_id: string }>(
      sql`/* projectNextHostnameBlockSubdomainPage:insertMissing */
      INSERT INTO url_hostname_blocks (
        url_hostname_id, blocked_by_id, blocked_source, relation_cleanup_root_block_id
      )
      SELECT candidate.id, ${operation.blockedById}, ${operation.blockedSource}, ${blockId}
      FROM unnest(${hostnameIds}::uuid[]) AS candidate(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM url_hostname_blocks existing
        WHERE existing.url_hostname_id = candidate.id AND existing.lifted_at IS NULL
          AND existing.domain_blocklist_source_id IS NULL
      )
      ORDER BY candidate.id
      RETURNING url_hostname_id
    `,
    )
    await enqueueHostnameCacheInvalidation(query, hostnameIds)
    registerPostCommitAction(query, async () => {
      await drainHostnameCacheInvalidationWork({ hostnameIds }).catch(onError)
    })

    const newlyOwnedHostnameCount = new Set(
      [...attached, ...inserted].map(row => row.url_hostname_id),
    ).size
    const nextCursor: HostnameBlockCleanupCursor =
      candidates.length < limit
        ? { stage: 'relations' }
        : {
            stage: 'subdomains',
            afterReversedHostname: candidates[0]!.page_after,
          }
    const updated = await advanceHostnameBlockCleanupProgress(query, blockId, expectedProgress, {
      blockedHostnameCount: newlyOwnedHostnameCount,
    })
    await query.commit()
    return { operation: updated, cursor: nextCursor, projected: candidates.length }
  }

  const nextCursor: HostnameBlockCleanupCursor =
    candidates.length < limit
      ? { stage: 'relations' }
      : {
          stage: 'subdomains',
          afterReversedHostname: candidates[0]!.page_after,
        }
  const updated = await advanceHostnameBlockCleanupProgress(query, blockId, expectedProgress)
  await query.commit()
  return { operation: updated, cursor: nextCursor, projected: candidates.length }
}

async function lockSubdomainCandidatePageBeforeOperation(
  query: TransactionQuery,
  blockId: string,
  expectedProgress: number,
  afterReversedHostname: string | undefined,
  limit: number,
): Promise<{
  operation: HostnameBlockCleanupOperation | null
  candidates: HostnameCandidate[] | null
}> {
  const operation = await getHostnameBlockCleanupOperationInTransaction(query, blockId)
  if (!operation || operation.completedAt || operation.progress !== expectedProgress) {
    return { operation, candidates: null }
  }
  const candidates = await lockHostnameBlockSubdomainCandidatePage(
    query,
    operation,
    afterReversedHostname,
    limit,
  )
  return { operation, candidates }
}
