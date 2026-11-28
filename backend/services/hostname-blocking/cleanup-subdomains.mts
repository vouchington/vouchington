import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import onError from '@modules/on-error'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import sql from 'sql-template-strings'
import {
  getHostnameBlockCleanupOperationInTransaction,
  lockHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import { advanceHostnameBlockCleanupProgress } from './cleanup-operation-progress.mts'
import { getPendingDescendantCleanupRootHostnames } from './cleanup-operation-ancestor.mts'
import {
  lockHostnameBlockSubdomainCandidatePage,
  type LockedSubdomainCandidatePage,
} from './lock-subdomain-candidate-page.mts'
import { getHostnameBlockingWorkLimit } from './work-limits.mts'

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
  if (!discovery.page) {
    return {
      operation: discovery.operation,
      cursor: { stage: 'subdomains', ...(afterReversedHostname ? { afterReversedHostname } : {}) },
      projected: 0,
    }
  }
  const { page } = discovery
  const { candidates } = page
  const nextCursor: HostnameBlockCleanupCursor =
    page.pageSize < limit
      ? { stage: 'relations' }
      : { stage: 'subdomains', afterReversedHostname: page.pageAfter! }
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
    const batchSize = getHostnameBlockingWorkLimit('hostname_scan_batch_size')
    const attached: Array<{ url_hostname_id: string }> = []
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- bounded batch UPDATE attaches unowned active staff blocks for this subdomain page
      const { rows: attachedBatch } = await query<{ url_hostname_id: string }>( // no-mistakes-disable-line query-reached-per-item: batched UPDATE attaching unowned blocks in DynamicConfig hostname_scan_batch_size pages (hard max 5000)
        sql`/* projectNextHostnameBlockSubdomainPage:attachExisting */
        WITH target AS (
          SELECT block.id
          FROM url_hostname_blocks block
          WHERE block.url_hostname_id = ANY(${hostnameIds}::uuid[])
            AND block.lifted_at IS NULL AND block.domain_blocklist_source_id IS NULL
            AND block.relation_cleanup_root_block_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM url_hostname_blocks owner
              WHERE owner.url_hostname_id = block.url_hostname_id
                AND owner.lifted_at IS NULL AND owner.domain_blocklist_source_id IS NULL
                AND owner.relation_cleanup_root_block_id IS NOT NULL
            )
          ORDER BY block.id
          LIMIT ${batchSize}
        )
        UPDATE url_hostname_blocks block
        SET relation_cleanup_root_block_id = ${blockId}
        FROM target
        WHERE block.id = target.id
        RETURNING block.url_hostname_id
      `,
      )
      attached.push(...attachedBatch)
      if (attachedBatch.length < batchSize) break
    }
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
    const updated = await advanceHostnameBlockCleanupProgress(query, blockId, expectedProgress, {
      blockedHostnameCount: newlyOwnedHostnameCount,
      next: nextCursor,
    })
    await query.commit()
    return { operation: updated, cursor: nextCursor, projected: candidates.length }
  }

  const updated = await advanceHostnameBlockCleanupProgress(query, blockId, expectedProgress, {
    next: nextCursor,
  })
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
  page: LockedSubdomainCandidatePage | null
}> {
  const operation = await getHostnameBlockCleanupOperationInTransaction(query, blockId)
  if (!operation || operation.completedAt || operation.progress !== expectedProgress) {
    return { operation, page: null }
  }
  const page = await lockHostnameBlockSubdomainCandidatePage(
    query,
    operation,
    afterReversedHostname,
    limit,
  )
  return { operation, page }
}
