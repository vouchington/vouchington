import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import { insertVoteWeightPenalty } from '@services/vote-integrity/insert-vote-weight-penalty'
import {
  lockHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import { advanceHostnameBlockCleanupProgress } from './cleanup-operation-progress.mts'
import { deleteUrlRelationPage } from './delete-url-relation-page.mts'
import {
  advancePastHostname,
  advancePastUrlPage,
  getHostnameCleanupPage,
  getHostnameUrlPage,
} from './relation-cleanup-pages.mts'

type RelationCursor = Extract<HostnameBlockCleanupCursor, { stage: 'relations' }>

type WorkLimits = {
  hostname: number
  url: number
  relation: number
}

export async function softDeleteNextBlockedHostnameRelationPage(
  blockId: string,
  expectedProgress: number,
  cursor: RelationCursor,
  limits: WorkLimits,
): Promise<{
  operation: HostnameBlockCleanupOperation | null
  cursor: HostnameBlockCleanupCursor
  deleted: number
}> {
  await using query = await beginTransaction()
  const operation = await lockHostnameBlockCleanupOperation(query, blockId)
  if (!operation || operation.completedAt || operation.progress !== expectedProgress) {
    return { operation, cursor, deleted: 0 }
  }

  const result = await processRelationCleanupPage(query, operation, cursor, limits)
  const updated = await advanceHostnameBlockCleanupProgress(query, blockId, expectedProgress, {
    softDeletedRelationCount: result.deleted,
    penalizedUserCount: result.penalized,
    next: result.cursor,
  })
  await query.commit()
  return { operation: updated, cursor: result.cursor, deleted: result.deleted }
}

async function processRelationCleanupPage(
  query: TransactionQuery,
  operation: HostnameBlockCleanupOperation,
  cursor: RelationCursor,
  limits: WorkLimits,
): Promise<{ cursor: HostnameBlockCleanupCursor; deleted: number; penalized: number }> {
  if (!cursor.hostnames) {
    const hostnames = await getHostnameCleanupPage(
      query,
      operation,
      cursor.afterReversedHostname,
      limits.hostname,
    )
    if (hostnames.length === 0) return { cursor: { stage: 'penalties' }, deleted: 0, penalized: 0 }
    return {
      cursor: {
        stage: 'relations',
        ...(cursor.afterReversedHostname
          ? { afterReversedHostname: cursor.afterReversedHostname }
          : {}),
        hostnames,
        hostnameIndex: 0,
        hostnamesExhausted: hostnames.length < limits.hostname,
      },
      deleted: 0,
      penalized: 0,
    }
  }

  const hostname = cursor.hostnames[cursor.hostnameIndex ?? 0]!
  if (!hostname.owned) return { cursor: advancePastHostname(cursor), deleted: 0, penalized: 0 }

  if (!cursor.urlIds) {
    const urlIds = await getHostnameUrlPage(query, hostname.id, cursor.urlAfterId, limits.url)
    if (urlIds.length === 0)
      return { cursor: advancePastHostname(cursor), deleted: 0, penalized: 0 }
    return {
      cursor: {
        ...cursor,
        urlIds,
        urlsExhausted: urlIds.length < limits.url,
        tableIndex: 0,
      },
      deleted: 0,
      penalized: 0,
    }
  }

  const tables = getEntityRelationUrlTables()
  const tableIndex = cursor.tableIndex ?? 0
  if (tableIndex >= tables.length)
    return { cursor: advancePastUrlPage(cursor), deleted: 0, penalized: 0 }

  const table = tables[tableIndex]!
  const relationPage = await deleteUrlRelationPage(
    query,
    table,
    cursor.urlIds!,
    cursor.relationAfter,
    operation.blockedById,
    limits.relation,
  )
  const creatorIds = [
    ...new Set(relationPage.deleted.flatMap(row => (row.createdById ? [row.createdById] : []))),
  ]
  const penalizedUserIds =
    operation.penalizeCreators && creatorIds.length > 0
      ? await insertVoteWeightPenalty({
          userIds: creatorIds,
          reason: 'blocked_hostname',
          sourceHostnameId: operation.hostnameId,
          sourceHostnameBlockId: operation.blockId,
          createdById: operation.blockedById,
          query,
          enqueueRecalculation: false,
        })
      : []

  const relationAfter = relationPage.page.at(-1)
  let nextCursor: RelationCursor
  if (relationPage.page.length < limits.relation) {
    nextCursor = advancePastRelationTable(cursor, tableIndex + 1)
  } else {
    nextCursor = { ...cursor, relationAfter: relationAfter! }
  }
  return {
    cursor: nextCursor,
    deleted: relationPage.deleted.length,
    penalized: penalizedUserIds.length,
  }
}

function advancePastRelationTable(cursor: RelationCursor, tableIndex: number): RelationCursor {
  const { relationAfter: _relationAfter, ...base } = cursor
  return { ...base, tableIndex }
}
