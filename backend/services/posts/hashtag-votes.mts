import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { upsertEntityRelation } from '@services/entity-relations'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import { getEntityRelationVoteTableName } from '@voucha/types/entities/entity-relations-metadata'
import { refreshPostCategoryVoteStatsInTransaction } from './category-vote-stats.mts'
import { getRemovedPositivePostHashtagRelations } from './hashtag-vote-removals.mts'

/** Casts the post author's current category votes and updates score rows in the caller's tx. */
export async function castPostCategoryVotesInTransaction(
  query: TransactionQuery,
  actor: PrivateUser,
  postId: string,
  topicCategoryOwnerId: string | null,
): Promise<void> {
  const relationIdsByTable = new Map<string, Set<string>>()
  const aliasRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic_alias',
    predicate: 'category',
  })
  // ast-grep-ignore: no-three-sequential-awaits -- category reads and writes are ordered on one transaction to preserve deterministic vote replacement
  const activeAliasIds = await getActivePostHashtagRelationObjectIds(
    query,
    aliasRelation.table_name,
    postId,
    actor.id,
  )
  const removedAliasRelations = await getRemovedPositivePostHashtagRelations(
    actor.id,
    aliasRelation,
    postId,
    { query },
  )
  await writeVotes(query, actor.id, aliasRelation, removedAliasRelations, 0)
  const activeAliasRelations = await upsertEntityRelation(
    actor,
    aliasRelation,
    { id: postId },
    activeAliasIds.map(id => ({ id })),
    { query, enqueueVoteStats: false, vote: false, suppressNotificationReconcile: true },
  )
  await writeVotes(query, actor.id, aliasRelation, activeAliasRelations, 1)
  collectRelationIds(relationIdsByTable, aliasRelation.table_name, [
    ...removedAliasRelations,
    ...activeAliasRelations,
  ])

  const topicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  const topicIds = await getPersistedPostTopicIds(query, postId)
  const retainedTopicRelations = await upsertEntityRelation(
    actor,
    topicRelation,
    { id: postId },
    topicIds.map(id => ({ id })),
    { query, enqueueVoteStats: false, vote: false, suppressNotificationReconcile: true },
  )
  collectRelationIds(relationIdsByTable, topicRelation.table_name, retainedTopicRelations)

  if (topicCategoryOwnerId && (await isActiveUser(query, topicCategoryOwnerId))) {
    // ast-grep-ignore: no-three-sequential-awaits -- removed and retained topic votes are ordered within the transaction
    const removedTopicRelations = await getRemovedPositiveTopicRelations(
      query,
      topicCategoryOwnerId,
      topicRelation,
      postId,
      topicIds,
    )
    await writeVotes(query, topicCategoryOwnerId, topicRelation, removedTopicRelations, 0)
    await writeVotes(query, topicCategoryOwnerId, topicRelation, retainedTopicRelations, 1)
    collectRelationIds(relationIdsByTable, topicRelation.table_name, removedTopicRelations)
  }

  await refreshPostCategoryVoteStatsInTransaction(
    query,
    postId,
    new Map([...relationIdsByTable].map(([table, ids]) => [table, [...ids]])),
  )
}

async function isActiveUser(query: TransactionQuery, userId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(sql`/* postCategoryVotes.activeOwner */
    SELECT id FROM users WHERE id = ${userId} AND deleted_at IS NULL`)
  return rows.length > 0
}

async function getPersistedPostTopicIds(
  query: TransactionQuery,
  postId: string,
): Promise<string[]> {
  const { rows } = await write<{ topic_id: string }>(
    `/* getPersistedPostTopicIds */
      SELECT topic_id FROM post_explicit_topic_categories WHERE post_id = $1
      UNION
      SELECT topic_id FROM post_data_point_topics WHERE post_id = $1`,
    [postId],
    { query },
  )
  return rows.map(row => row.topic_id)
}

async function getActivePostHashtagRelationObjectIds(
  query: TransactionQuery,
  tableName: string,
  postId: string,
  contributorId: string,
): Promise<string[]> {
  const statement = sql`/* castPostCategoryVotesInTransaction.aliases */ SELECT DISTINCT relation.object_id FROM `
  statement.append(tableName)
  statement.append(sql` relation
    JOIN post_topic_alias_sources source
      ON source.post_id = relation.subject_id
      AND source.topic_alias_id = relation.object_id
    WHERE relation.subject_id = ${postId}
      AND relation.deleted_at IS NULL
      AND source.contributor_id = ${contributorId}`)
  const { rows } = await write<{ object_id: string }>(statement, { query })
  return rows.map(row => row.object_id)
}

async function getRemovedPositiveTopicRelations(
  query: TransactionQuery,
  voterId: string,
  relation: EntityRelationMetadata,
  postId: string,
  retainedTopicIds: string[],
): Promise<Array<{ id: string }>> {
  const statement = sql`/* getRemovedPositiveTopicRelations */
    SELECT relation.id FROM `
  statement.append(relation.table_name)
  statement.append(sql` relation
    JOIN LATERAL (
      SELECT score FROM `)
  statement.append(getEntityRelationVoteTableName(relation))
  statement.append(sql` vote
      WHERE vote.entity_relation_id = relation.id AND vote.user_id = ${voterId}
      ORDER BY vote.id DESC LIMIT 1
    ) current_vote ON current_vote.score > 0
    WHERE relation.subject_id = ${postId}
      AND NOT relation.object_id = ANY(${retainedTopicIds}::uuid[])`)
  const { rows } = await write<{ id: string }>(statement, { query })
  return rows
}

async function writeVotes(
  query: TransactionQuery,
  voterId: string,
  relation: EntityRelationMetadata,
  relations: Array<{ id?: string }>,
  score: 0 | 1,
): Promise<void> {
  const votes = relations.flatMap(item => (item.id ? [{ entityId: item.id, score }] : []))
  if (votes.length === 0) return
  await upsertEntityRelationElectionVotes(voterId, votes, undefined, relation, {
    query,
    enqueueVoteStats: false,
  })
}

function collectRelationIds(
  target: Map<string, Set<string>>,
  tableName: string,
  relations: Array<{ id?: string }>,
): void {
  const ids = target.get(tableName) ?? new Set<string>()
  for (const relation of relations) if (relation.id) ids.add(relation.id)
  target.set(tableName, ids)
}
