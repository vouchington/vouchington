import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'
import { getEntityRelationVoteTableName } from '@voucha/types/entities/entity-relations-metadata'
import {
  ensureTopicCategoryRelations,
  loadActorAliasRelations,
  writeCategoryVotes,
} from './category-vote-cast.mts'
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
  const topicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  // ast-grep-ignore: no-three-sequential-awaits -- category reads and writes are ordered on one transaction to preserve deterministic vote replacement
  const activeAliasRelations = await loadActorAliasRelations(query, aliasRelation, actor, postId)
  const removedAliasRelations = await getRemovedPositivePostHashtagRelations(
    actor.id,
    aliasRelation,
    postId,
    { query },
  )
  const topicIds = await getPersistedPostTopicIds(query, postId)
  const retainedTopicRelations = await ensureTopicCategoryRelations(
    query,
    actor,
    topicRelation,
    postId,
    topicIds,
  )
  collectRelationIds(relationIdsByTable, aliasRelation.table_name, [
    ...removedAliasRelations,
    ...activeAliasRelations,
  ])
  collectRelationIds(relationIdsByTable, topicRelation.table_name, retainedTopicRelations)

  const activeTopicOwnerId =
    topicCategoryOwnerId && (await isActiveUser(query, topicCategoryOwnerId))
      ? topicCategoryOwnerId
      : null
  const removedTopicRelations = activeTopicOwnerId
    ? await getRemovedPositiveTopicRelations(
        query,
        activeTopicOwnerId,
        topicRelation,
        postId,
        topicIds,
      )
    : []
  if (removedTopicRelations.length > 0) {
    collectRelationIds(relationIdsByTable, topicRelation.table_name, removedTopicRelations)
  }
  await writeCategoryVotes(query, actor.id, activeTopicOwnerId, {
    aliasRelation,
    removedAliasRelations,
    activeAliasRelations,
    topicRelation,
    removedTopicRelations,
    retainedTopicRelations,
  })

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

function collectRelationIds(
  target: Map<string, Set<string>>,
  tableName: string,
  relations: Array<{ id?: string }>,
): void {
  const ids = target.get(tableName) ?? new Set<string>()
  for (const relation of relations) if (relation.id) ids.add(relation.id)
  target.set(tableName, ids)
}
