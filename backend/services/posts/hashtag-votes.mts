import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { upsertEntityRelation } from '@services/entity-relations'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'
import { refreshEntityRelationVoteStatsFromPrimaryWithFallback } from '@services/elections-votes/entity-relation/refresh-stats'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import { getEntityRelationVoteTableName } from '@voucha/types/entities/entity-relations-metadata'
import { getRemovedPositivePostHashtagRelations } from './hashtag-vote-removals.mts'

export async function finalizePostHashtagCategoryVotes(
  creator: PrivateUser,
  postId: string,
  topicCategoryOwnerId?: string,
): Promise<void> {
  const aliasRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic_alias',
    predicate: 'category',
  })
  await voteAndRefreshPostHashtagRelations(creator, aliasRelation, postId)
  if (!topicCategoryOwnerId) return
  return finalizePostTopicCategoryVotes(
    creator,
    postId,
    topicCategoryOwnerId,
    await getPersistedPostTopicIds(postId),
  )
}

async function finalizePostTopicCategoryVotes(
  creator: PrivateUser,
  postId: string,
  topicCategoryOwnerId: string,
  topicIds: string[],
): Promise<void> {
  const topicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  // ast-grep-ignore: no-three-sequential-awaits -- relation creation, stale-vote removal, and primary score refresh are ordered
  const retainedRelations = await upsertEntityRelation(
    creator,
    topicRelation,
    { id: postId },
    topicIds.map(id => ({ id })),
    { vote: false },
  )
  const removedRelations = await getRemovedPositiveTopicRelations(
    topicCategoryOwnerId,
    topicRelation,
    postId,
    topicIds,
  )
  await writeAndRefreshPostRelationVotes(topicCategoryOwnerId, topicRelation, removedRelations, 0)
  return writeAndRefreshPostRelationVotes(topicCategoryOwnerId, topicRelation, retainedRelations, 1)
}

async function getPersistedPostTopicIds(postId: string): Promise<string[]> {
  const { rows } = await write<{ topic_id: string }>(
    `/* getPersistedPostTopicIds */
      SELECT topic_id
      FROM post_explicit_topic_categories
      WHERE post_id = $1
      UNION
      SELECT topic_id
      FROM post_data_point_topics
      WHERE post_id = $1`,
    [postId],
  )
  return rows.map(row => row.topic_id)
}

async function voteAndRefreshPostHashtagRelations(
  creator: PrivateUser,
  relation: EntityRelationMetadata,
  postId: string,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- relation lookup, vote write, and primary score refresh are ordered
  const activeObjectIds = await getActivePostHashtagRelationObjectIds(
    relation.table_name,
    postId,
    creator.id,
  )
  const removedRelations = await getRemovedPositivePostHashtagRelations(
    creator.id,
    relation,
    postId,
  )
  const relations = await upsertEntityRelation(
    creator,
    relation,
    { id: postId },
    activeObjectIds.map(id => ({ id })),
    { enqueueVoteStats: false, vote: true },
  )
  await writeAndRefreshPostRelationVotes(creator.id, relation, removedRelations, 0)
  await refreshVoteStats(relation.table_name, relations)
}

async function getActivePostHashtagRelationObjectIds(
  tableName: string,
  postId: string,
  contributorId: string,
): Promise<string[]> {
  const query = sql`/* finalizePostHashtagCategoryVotes */ SELECT DISTINCT relation.object_id FROM `
  query.append(tableName)
  query.append(sql` relation
    JOIN post_topic_alias_sources source
      ON source.post_id = relation.subject_id
      AND source.topic_alias_id = relation.object_id
    WHERE relation.subject_id = ${postId}
      AND relation.deleted_at IS NULL
      AND source.contributor_id = ${contributorId}`)
  const { rows } = await write<{ object_id: string }>(query)
  return rows.map(row => row.object_id)
}

async function getRemovedPositiveTopicRelations(
  creatorId: string,
  relation: EntityRelationMetadata,
  postId: string,
  retainedTopicIds: string[],
): Promise<Array<{ id: string }>> {
  const query = sql`/* getRemovedPositiveTopicRelations */
    SELECT relation.id
    FROM `
  query.append(relation.table_name)
  query.append(sql` relation
    JOIN LATERAL (
      SELECT score
      FROM `)
  query.append(getEntityRelationVoteTableName(relation))
  query.append(sql` vote
      WHERE vote.entity_relation_id = relation.id
        AND vote.user_id = ${creatorId}
      ORDER BY vote.id DESC
      LIMIT 1
    ) current_vote ON current_vote.score > 0
    WHERE relation.subject_id = ${postId}
      AND relation.deleted_at IS NULL
      AND NOT relation.object_id = ANY(${retainedTopicIds}::uuid[])
  `)
  const { rows } = await write<{ id: string }>(query)
  return rows
}

async function writeAndRefreshPostRelationVotes(
  voterId: string,
  relation: EntityRelationMetadata,
  relations: Array<{ id?: string }>,
  score: 0 | 1,
): Promise<void> {
  const votes = relations.flatMap(relation =>
    relation.id ? [{ entityId: relation.id, score }] : [],
  )
  if (votes.length === 0) return
  await upsertEntityRelationElectionVotes(voterId, votes, undefined, relation, {
    enqueueVoteStats: false,
  })
  await refreshVoteStats(relation.table_name, relations)
}

async function refreshVoteStats(
  relationTable: string,
  relations: Array<{ id?: string }>,
): Promise<void> {
  await Promise.all(
    relations.flatMap(relation =>
      relation.id
        ? [
            refreshEntityRelationVoteStatsFromPrimaryWithFallback(
              createEntityRelationElectionTarget(relation.id, relationTable),
            ),
          ]
        : [],
    ),
  )
}
