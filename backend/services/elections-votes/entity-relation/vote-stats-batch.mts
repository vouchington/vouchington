import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  write,
  type QueryExecutor,
  type TransactionQuery,
} from '@data-stores/psql'
import { invalidate } from '@services/entity-cache'
import { recordPostTopicRelationPublicationChanges } from '@services/entity-relations'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import type { EntityRelationElectionTarget } from '@queues/elections/types'
import sql from 'sql-template-strings'
import { entityRelationElectionTables } from './target.mts'
import { lockEntityRelationVoteStatsPostPublicationScopes } from './vote-stats-batch-publication-locks.mts'

export const PRIMARY_REFRESH_BATCH_SIZE = 1_000
const topHashtagRelationTables = new Set([
  'relation__post__category__topic_alias',
  'relation__rss_feed_item__category__topic_alias',
])

export type EntityRelationVoteStatsBatchOptions = {
  query?: TransactionQuery
  invalidateCache?: boolean
  enqueueTopHashtagRefresh?: boolean
}

export async function updateEntityRelationElectionVoteStatsFromPrimaryBatch(
  targets: readonly EntityRelationElectionTarget[],
  options: EntityRelationVoteStatsBatchOptions = {},
): Promise<EntityRelationElectionTarget[]> {
  const byTable = new Map<EntityRelationElectionTarget['relationTable'], string[]>()
  for (const target of targets) {
    const ids = byTable.get(target.relationTable) ?? []
    ids.push(target.entityRelationId)
    byTable.set(target.relationTable, ids)
  }
  const changedTargets: EntityRelationElectionTarget[] = []
  for (const [relationTable, relationIds] of byTable) {
    const chunks = chunkRelationIds(relationIds)
    for (const ids of chunks) {
      // oxlint-disable-next-line no-await-in-loop -- bounded primary updates preserve writer pool capacity
      const changes = await refreshChunkAndCapture(relationTable, ids, options.query)
      changedTargets.push(
        ...changes.map(({ id: entityRelationId }) => ({ entityRelationId, relationTable })),
      )
    }
  }
  if (options.invalidateCache !== false)
    await publishEntityRelationElectionVoteStats(changedTargets, options)
  return changedTargets
}

/** Publishes already-persisted primary stats after their transaction commits. */
export async function publishEntityRelationElectionVoteStats(
  targets: readonly EntityRelationElectionTarget[],
  options: Pick<EntityRelationVoteStatsBatchOptions, 'enqueueTopHashtagRefresh'> = {},
): Promise<void> {
  const byTable = groupTargetsByTable(targets)
  for (const [relationTable, relationIds] of byTable) {
    for (const ids of chunkRelationIds(relationIds)) {
      // oxlint-disable-next-line no-await-in-loop -- cache delete chunks bound Valkey in-flight work
      await invalidate.entity_relation_elections(...ids)
    }
    if (options.enqueueTopHashtagRefresh !== false && topHashtagRelationTables.has(relationTable))
      void enqueueRefreshTopHashtags()
  }
}

type UpdatedEntityRelationVoteStats = {
  id: string
  subject_id: string
  object_id: string
  prior_votes_score_net: number
  next_votes_score_net: number
}

async function refreshChunkAndCapture(
  relationTable: EntityRelationElectionTarget['relationTable'],
  relationIds: string[],
  transactionQuery: TransactionQuery | undefined,
): Promise<UpdatedEntityRelationVoteStats[]> {
  if (transactionQuery) {
    return refreshChunkAndCaptureInTransaction(transactionQuery, relationTable, relationIds)
  }
  await using query = await beginTransaction()
  const result = await refreshChunkAndCaptureInTransaction(query, relationTable, relationIds)
  await query.commit()
  return result
}

async function refreshChunkAndCaptureInTransaction(
  query: TransactionQuery,
  relationTable: EntityRelationElectionTarget['relationTable'],
  relationIds: string[],
): Promise<UpdatedEntityRelationVoteStats[]> {
  // ast-grep-ignore: no-three-sequential-awaits -- lock scopes before row updates, then capture the resulting transitions
  await lockEntityRelationVoteStatsPostPublicationScopes(query, relationTable, relationIds)
  const changes = await refreshChunk(relationTable, relationIds, query)
  await recordPostTopicRelationPublicationChanges(
    query,
    relationTable,
    changes.filter(hasPublicEligibilityTransition),
  )
  return changes
}

function hasPublicEligibilityTransition({
  prior_votes_score_net,
  next_votes_score_net,
}: UpdatedEntityRelationVoteStats): boolean {
  return prior_votes_score_net > 0 !== next_votes_score_net > 0
}

async function refreshChunk(
  relationTable: EntityRelationElectionTarget['relationTable'],
  relationIds: string[],
  executor: QueryExecutor = write,
): Promise<UpdatedEntityRelationVoteStats[]> {
  if (relationIds.length === 0) return []
  const table = assertWhitelistedSqlIdentifier(
    relationTable,
    entityRelationElectionTables,
    'entityRelationTable',
  )
  const query = sql`/* updateEntityRelationElectionVoteStatsFromPrimaryBatch */
    WITH target_ids AS (SELECT unnest(${relationIds}::uuid[]) AS id),
    current_votes AS (
      SELECT DISTINCT ON (vote.entity_relation_id, vote.user_id) vote.entity_relation_id, vote.user_id, vote.score
      FROM entity_relation_votes vote JOIN target_ids target ON target.id = vote.entity_relation_id
      WHERE vote.relation_table = ${relationTable}
      ORDER BY vote.entity_relation_id, vote.user_id, vote.id DESC
    ), aggregated AS (
      SELECT vote.entity_relation_id,
        COALESCE(SUM(CASE WHEN vote.score > 0 THEN vote.score * user_row.vote_weight ELSE 0 END), 0)::double precision AS votes_score_up,
        0::double precision AS votes_score_none,
        COALESCE(-SUM(CASE WHEN vote.score < 0 THEN vote.score * user_row.vote_weight ELSE 0 END), 0)::double precision AS votes_score_down,
        COUNT(*) FILTER (WHERE vote.score > 0)::integer AS votes_count_up,
        0::integer AS votes_count_none,
        COUNT(*) FILTER (WHERE vote.score < 0)::integer AS votes_count_down
      FROM current_votes vote JOIN users user_row ON user_row.id = vote.user_id AND user_row.deleted_at IS NULL
      WHERE vote.score IS NOT NULL GROUP BY vote.entity_relation_id
    ), stats AS (
      SELECT target.id,
        COALESCE(aggregated.votes_score_up, 0)::double precision AS votes_score_up,
        COALESCE(aggregated.votes_score_none, 0)::double precision AS votes_score_none,
        COALESCE(aggregated.votes_score_down, 0)::double precision AS votes_score_down,
        COALESCE(aggregated.votes_count_up, 0)::integer AS votes_count_up,
        COALESCE(aggregated.votes_count_none, 0)::integer AS votes_count_none,
        COALESCE(aggregated.votes_count_down, 0)::integer AS votes_count_down
      FROM target_ids target LEFT JOIN aggregated ON aggregated.entity_relation_id = target.id
    ), current AS MATERIALIZED (
      SELECT relation.id, relation.votes_score_net AS prior_votes_score_net
      FROM `
  query.append(table)
  query.append(sql` relation JOIN stats ON stats.id = relation.id
      ORDER BY relation.id
      FOR UPDATE
    ), updated AS (UPDATE `)
  query.append(table)
  query.append(sql` relation SET
      votes_score_up = stats.votes_score_up, votes_score_none = stats.votes_score_none,
      votes_score_down = stats.votes_score_down, votes_count_up = stats.votes_count_up,
      votes_count_none = stats.votes_count_none, votes_count_down = stats.votes_count_down
      FROM stats, current
      WHERE relation.id = stats.id AND current.id = relation.id AND (
        relation.votes_score_up IS DISTINCT FROM stats.votes_score_up OR relation.votes_score_none IS DISTINCT FROM stats.votes_score_none OR
        relation.votes_score_down IS DISTINCT FROM stats.votes_score_down OR relation.votes_count_up IS DISTINCT FROM stats.votes_count_up OR
        relation.votes_count_none IS DISTINCT FROM stats.votes_count_none OR relation.votes_count_down IS DISTINCT FROM stats.votes_count_down
      ) RETURNING
        relation.id,
        relation.subject_id,
        relation.object_id,
        current.prior_votes_score_net,
        relation.votes_score_net AS next_votes_score_net
    ) SELECT * FROM updated`)
  return (await executor<UpdatedEntityRelationVoteStats>(query)).rows
}

function groupTargetsByTable(
  targets: readonly EntityRelationElectionTarget[],
): Map<EntityRelationElectionTarget['relationTable'], string[]> {
  const byTable = new Map<EntityRelationElectionTarget['relationTable'], string[]>()
  for (const target of targets) {
    const ids = byTable.get(target.relationTable) ?? []
    ids.push(target.entityRelationId)
    byTable.set(target.relationTable, ids)
  }
  return byTable
}

function chunkRelationIds(relationIds: string[]): string[][] {
  const ids = [...new Set(relationIds)].toSorted()
  return Array.from({ length: Math.ceil(ids.length / PRIMARY_REFRESH_BATCH_SIZE) }, (_, index) =>
    ids.slice(index * PRIMARY_REFRESH_BATCH_SIZE, (index + 1) * PRIMARY_REFRESH_BATCH_SIZE),
  )
}
