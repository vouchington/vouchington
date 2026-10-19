import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { upsertEntityRelation } from '@services/entity-relations'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import type { PrivateUser } from '@services/users/types'

type RelationRef = { id?: string }
type Vote = { entityId: string; score: 0 | 1 }

const relationWriteOptions = {
  vote: false as const,
  enqueueVoteStats: false,
  suppressNotificationReconcile: true,
}

/** Reads alias rows sync already wrote. Inserts only aliases that are still missing. */
export async function loadActorAliasRelations(
  query: TransactionQuery,
  relation: EntityRelationMetadata,
  actor: PrivateUser,
  postId: string,
): Promise<Array<{ id: string }>> {
  const statement = sql`/* castPostCategoryVotesInTransaction.aliases */
    SELECT source.topic_alias_id, relation.id
    FROM post_topic_alias_sources source
    LEFT JOIN `
  statement.append(relation.table_name)
  statement.append(sql` relation
      ON relation.subject_id = source.post_id
      AND relation.object_id = source.topic_alias_id
      AND relation.deleted_at IS NULL
    WHERE source.post_id = ${postId}
      AND source.contributor_user_id = ${actor.id}`)
  const { rows } = await write<{ topic_alias_id: string; id: string | null }>(statement, { query })
  const missing = rows.flatMap(row => (row.id ? [] : [row.topic_alias_id]))
  const existing = rows.flatMap(row => (row.id ? [{ id: row.id }] : []))
  if (missing.length === 0) return existing
  const inserted = await upsertEntityRelation(
    actor,
    relation,
    { id: postId },
    missing.map(id => ({ id })),
    { query, ...relationWriteOptions },
  )
  return [...existing, ...inserted.flatMap(row => (row.id ? [{ id: row.id }] : []))]
}

/** Reads topic rows sync already wrote. Data-point topics are inserted here when sync had none. */
export async function ensureTopicCategoryRelations(
  query: TransactionQuery,
  actor: PrivateUser,
  relation: EntityRelationMetadata,
  postId: string,
  topicIds: string[],
): Promise<Array<{ id: string }>> {
  if (topicIds.length === 0) return []
  const statement = sql`/* castPostCategoryVotesInTransaction.topicRelations */
    SELECT id, object_id FROM `
  statement.append(relation.table_name)
  statement.append(sql` relation
    WHERE subject_id = ${postId}
      AND object_id = ANY(${topicIds}::uuid[])
      AND deleted_at IS NULL`)
  const { rows } = await write<{ id: string; object_id: string }>(statement, { query })
  const found = new Set(rows.map(row => row.object_id.toLowerCase()))
  const missing = topicIds.filter(id => !found.has(id.toLowerCase()))
  if (missing.length === 0) return rows.map(row => ({ id: row.id }))
  const inserted = await upsertEntityRelation(
    actor,
    relation,
    { id: postId },
    missing.map(id => ({ id })),
    { query, ...relationWriteOptions },
  )
  return [
    ...rows.map(row => ({ id: row.id })),
    ...inserted.flatMap(row => (row.id ? [{ id: row.id }] : [])),
  ]
}

/** One vote statement when the actor and the topic owner are the same user. */
export async function writeCategoryVotes(
  query: TransactionQuery,
  actorId: string,
  topicOwnerId: string | null,
  parts: {
    aliasRelation: EntityRelationMetadata
    removedAliasRelations: RelationRef[]
    activeAliasRelations: RelationRef[]
    topicRelation: EntityRelationMetadata
    removedTopicRelations: RelationRef[]
    retainedTopicRelations: RelationRef[]
  },
): Promise<void> {
  const aliasVotes = votes(parts.removedAliasRelations, 0).concat(
    votes(parts.activeAliasRelations, 1),
  )
  const topicVotes = topicOwnerId
    ? votes(parts.removedTopicRelations, 0).concat(votes(parts.retainedTopicRelations, 1))
    : []
  if (topicOwnerId && topicOwnerId.toLowerCase() === actorId.toLowerCase()) {
    await writeUserVotes(query, actorId, [
      [parts.aliasRelation, aliasVotes],
      [parts.topicRelation, topicVotes],
    ])
    return
  }
  await writeUserVotes(query, actorId, [[parts.aliasRelation, aliasVotes]])
  if (topicOwnerId) await writeUserVotes(query, topicOwnerId, [[parts.topicRelation, topicVotes]])
}

function votes(relations: RelationRef[], score: 0 | 1): Vote[] {
  return relations.flatMap(relation => (relation.id ? [{ entityId: relation.id, score }] : []))
}

async function writeUserVotes(
  query: TransactionQuery,
  userId: string,
  groups: Array<[EntityRelationMetadata, Vote[]]>,
): Promise<void> {
  const cast = groups.flatMap(([, items]) => items)
  const relations = groups.flatMap(([relation, items]) => (items.length > 0 ? [relation] : []))
  if (cast.length === 0 || relations.length === 0) return
  await upsertEntityRelationElectionVotes(userId, cast, undefined, relations, {
    query,
    enqueueVoteStats: false,
  })
}
