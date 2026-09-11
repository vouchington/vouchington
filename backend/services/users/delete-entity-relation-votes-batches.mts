import type { TransactionQuery } from '@data-stores/psql/types'
import {
  lockPostPublicationPostScopes,
  lockTopicAliasPublicationScopes,
  lockTopicRssFeedPublicationScopes,
} from '@services/post-publication'
import sql from 'sql-template-strings'
import { getPublicationVoteTargetScopes } from './delete-publication-vote-targets.mts'
import {
  recomputeEntityRelationVoteStats,
  recordUserDeletionRelationPublicationChanges,
} from './delete-entity-relation-votes.mts'

export async function deleteUserEntityRelationVotesBatch(
  requestId: string,
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<number> {
  const batch = await getEntityRelationVoteBatch(query, userId, batchSize)
  if (batch.candidates.length === 0) return 0
  const deleted = await deleteEntityRelationVoteBatch(query, userId, batch)
  await recordDeletedEntityRelationVotes(query, requestId, deleted)
  return batch.candidates.length
}

type EntityRelationVoteBatch = {
  candidates: { id: string; relation_table: string; entity_relation_id: string }[]
  scopes: Awaited<ReturnType<typeof getPublicationVoteTargetScopes>>
}

async function getEntityRelationVoteBatch(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<EntityRelationVoteBatch> {
  const { rows: candidates } = await query<{
    id: string
    relation_table: string
    entity_relation_id: string
  }>(sql`/* deleteUserEntityRelationVotesBatch:candidates */
    SELECT id, relation_table, entity_relation_id FROM entity_relation_votes
    WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}
  `)
  const targets = candidates.map(candidate => ({
    relationTable: candidate.relation_table,
    entityRelationId: candidate.entity_relation_id,
  }))
  const scopes = await getPublicationVoteTargetScopes(query, targets)
  return { candidates, scopes }
}

async function deleteEntityRelationVoteBatch(
  query: TransactionQuery,
  userId: string,
  batch: EntityRelationVoteBatch,
) {
  await lockEntityRelationVoteScopes(query, batch.scopes)
  const { rows: deleted } = await query<{
    relation_table: string
    entity_relation_id: string
  }>(sql`/* deleteUserEntityRelationVotesBatch:delete */
    DELETE FROM entity_relation_votes
    WHERE id = ANY(${batch.candidates.map(candidate => candidate.id)}::uuid[])
      AND user_id = ${userId}
    RETURNING relation_table, entity_relation_id
  `)
  return deleted
}

async function lockEntityRelationVoteScopes(
  query: TransactionQuery,
  scopes: EntityRelationVoteBatch['scopes'],
): Promise<void> {
  await lockPostPublicationPostScopes(query, scopes.postIds)
  await lockEntityRelationVoteTopicScopes(query, scopes)
}

async function lockEntityRelationVoteTopicScopes(
  query: TransactionQuery,
  scopes: EntityRelationVoteBatch['scopes'],
): Promise<void> {
  await lockTopicAliasPublicationScopes(query, scopes.topicAliasIds)
  await lockTopicRssFeedPublicationScopes(query, scopes.topicIds)
}

async function recordDeletedEntityRelationVotes(
  query: TransactionQuery,
  requestId: string,
  deleted: { relation_table: string; entity_relation_id: string }[],
): Promise<number> {
  if (deleted.length > 0) {
    await query(sql`/* deleteUserEntityRelationVotesBatch:recordImpacts */
      INSERT INTO user_deletion_relation_impacts
        (request_id, relation_table, entity_relation_id)
      SELECT ${requestId}::uuid AS request_id, impact.relation_table, impact.entity_relation_id
      FROM UNNEST(
        ${deleted.map(row => row.relation_table)}::text[],
        ${deleted.map(row => row.entity_relation_id)}::uuid[]
      ) AS impact(relation_table, entity_relation_id)
      ORDER BY request_id ASC NULLS LAST,
        impact.relation_table ASC NULLS LAST,
        impact.entity_relation_id ASC NULLS LAST
      ON CONFLICT (request_id, relation_table, entity_relation_id) DO NOTHING
    `)
    await query(sql`/* deleteUserEntityRelationVotesBatch:recordEffects */
      INSERT INTO user_deletion_external_works (request_id, work_kind, work_key)
      SELECT ${requestId}::uuid AS request_id,
        'entity-relation-effects' AS work_kind,
        impact.relation_table || ':' || impact.entity_relation_id::text AS work_key
      FROM UNNEST(
        ${deleted.map(row => row.relation_table)}::text[],
        ${deleted.map(row => row.entity_relation_id)}::uuid[]
      ) AS impact(relation_table, entity_relation_id)
      ORDER BY request_id ASC NULLS LAST, work_kind ASC NULLS LAST, work_key ASC NULLS LAST
      ON CONFLICT (request_id, work_kind, work_key) DO NOTHING
    `)
  }
  return deleted.length
}

export async function recomputeUserDeletionRelationImpactsBatch(
  requestId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<number> {
  const batch = await getRelationImpactBatch(query, requestId, batchSize)
  if (batch.rows.length === 0) return 0
  const changes = await lockAndRecomputeRelationImpacts(query, batch)
  return recordRelationImpactChanges(query, batch.rows, changes)
}

type RelationImpactBatch = {
  rows: { id: string; relation_table: string; entity_relation_id: string }[]
  targets: { relationTable: string; entityRelationId: string }[]
  scopes: Awaited<ReturnType<typeof getPublicationVoteTargetScopes>>
}

async function getRelationImpactBatch(
  query: TransactionQuery,
  requestId: string,
  batchSize: number,
): Promise<RelationImpactBatch> {
  const { rows } = await query<{
    id: string
    relation_table: string
    entity_relation_id: string
  }>(sql`/* recomputeUserDeletionRelationImpactsBatch:candidates */
    SELECT id, relation_table, entity_relation_id
    FROM user_deletion_relation_impacts
    WHERE request_id = ${requestId} AND recomputed_at IS NULL
    ORDER BY id LIMIT ${batchSize} FOR UPDATE
  `)
  const targets = rows.map(row => ({
    relationTable: row.relation_table,
    entityRelationId: row.entity_relation_id,
  }))
  const scopes = await getPublicationVoteTargetScopes(query, targets)
  return { rows, targets, scopes }
}

async function lockAndRecomputeRelationImpacts(
  query: TransactionQuery,
  batch: RelationImpactBatch,
) {
  await lockEntityRelationVoteScopes(query, batch.scopes)
  return recomputeEntityRelationVoteStats(batch.targets, query)
}

async function recordRelationImpactChanges(
  query: TransactionQuery,
  rows: RelationImpactBatch['rows'],
  changes: Awaited<ReturnType<typeof recomputeEntityRelationVoteStats>>,
): Promise<number> {
  await recordUserDeletionRelationPublicationChanges(changes, query)
  await query(sql`/* recomputeUserDeletionRelationImpactsBatch:complete */
    UPDATE user_deletion_relation_impacts SET recomputed_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${rows.map(row => row.id)}::uuid[])
  `)
  return rows.length
}
