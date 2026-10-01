import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
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
  type EntityRelationVoteTarget,
} from './delete-entity-relation-votes.mts'
import { recordDeletedRelationImpacts } from './record-deleted-relation-impacts.mts'
import { mapRelationImpactRow } from './relation-impact-targets.mts'

export async function deleteUserEntityRelationVotesBatch(
  requestId: string,
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<number> {
  const batch = await getEntityRelationVoteBatch(query, userId, batchSize)
  if (batch.candidates.length === 0) return 0
  const deleted = await deleteEntityRelationVoteBatch(query, userId, batch)
  await recordDeletedRelationImpacts(
    query,
    requestId,
    deleted.map(row => ({
      relationTable: row.entity_relation,
      subjectId: row.subject_id,
      entityRelationId: row.entity_relation_id,
    })),
  )
  return batch.candidates.length
}

type EntityRelationVoteBatch = {
  candidates: {
    id: string
    entity_relation: string
    subject_id: string
    entity_relation_id: string
  }[]
  scopes: Awaited<ReturnType<typeof getPublicationVoteTargetScopes>>
}

async function getEntityRelationVoteBatch(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<EntityRelationVoteBatch> {
  const { rows: candidates } = await query<{
    id: string
    entity_relation: string
    subject_id: string
    entity_relation_id: string
  }>(sql`/* deleteUserEntityRelationVotesBatch:candidates */
    SELECT id, entity_relation, subject_id, entity_relation_id FROM view_entity_relation_votes
    WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}
  `)
  const targets = candidates.map(candidate => ({
    relationTable: candidate.entity_relation,
    subjectId: candidate.subject_id,
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
  const families = [...new Set(batch.candidates.map(candidate => candidate.entity_relation))].toSorted()
  const statement = sql`/* deleteUserEntityRelationVotesBatch:delete */ WITH `
  families.forEach((family, index) => {
    if (index > 0) statement.append(', ')
    const candidates = batch.candidates.filter(candidate => candidate.entity_relation === family)
    statement.append(
      `deleted_${index} AS (DELETE FROM ${getEntityRelationVoteTableIdentifier(family)} vote `,
    )
    statement.append(sql`USING UNNEST(
      ${candidates.map(candidate => candidate.subject_id)}::uuid[],
      ${candidates.map(candidate => candidate.entity_relation_id)}::uuid[],
      ${candidates.map(candidate => candidate.id)}::uuid[]
    ) AS selected(subject_id, entity_relation_id, vote_id)
    WHERE vote.subject_id = selected.subject_id
      AND vote.entity_relation_id = selected.entity_relation_id
      AND vote.id = selected.vote_id AND vote.user_id = ${userId}
    RETURNING ${family}::elected_entity_relations AS entity_relation, vote.subject_id, vote.entity_relation_id)`)
  })
  statement.append(
    families.map((_family, index) => `SELECT * FROM deleted_${index}`).join(' UNION ALL '),
  )
  const { rows: deleted } = await query<{
    entity_relation: string
    subject_id: string
    entity_relation_id: string
  }>(statement)
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
  rows: { id: string }[]
  targets: EntityRelationVoteTarget[]
  scopes: Awaited<ReturnType<typeof getPublicationVoteTargetScopes>>
}

async function getRelationImpactBatch(
  query: TransactionQuery,
  requestId: string,
  batchSize: number,
): Promise<RelationImpactBatch> {
  const { rows } = await query<{
    id: string
    subject_id: string
  }>(sql`/* recomputeUserDeletionRelationImpactsBatch:candidates */
    SELECT *
    FROM user_deletion_relation_impacts
    WHERE request_id = ${requestId} AND recomputed_at IS NULL
    ORDER BY id LIMIT ${batchSize} FOR UPDATE
  `)
  const targets = rows.map(mapRelationImpactRow)
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
