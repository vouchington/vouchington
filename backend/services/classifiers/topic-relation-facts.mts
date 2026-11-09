import { assertWhitelistedSqlIdentifier, type QueryExecutor } from '@data-stores/psql'
import { entityRelationElectionTables } from '@services/elections-votes/entity-relation/target'
import sql from 'sql-template-strings'

export type ActiveSubjectTopicRelation = {
  id: string
  topicId: string
  netScore: number
}

/**
 * The captured topics a classifier may still tag: neither deleted nor merged away. This lookup
 * does not lock topic rows. A missing topic fails the relation foreign key, and readers reject a
 * topic that is deleted or merged after the write. Writers still skip those topics here.
 */
export async function readActiveClassifierTopicIds(
  query: QueryExecutor,
  topicIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (topicIds.length === 0) return new Set()
  const { rows } = await query<{ id: string }>(sql`/* readActiveClassifierTopicIds */
    SELECT id FROM topics
    WHERE id = ANY(${[...topicIds]}::uuid[]) AND deleted_at IS NULL AND merged_into_topic_id IS NULL
    ORDER BY id
  `)
  return new Set(rows.map(row => row.id))
}

/**
 * The given topics the subject already has a relation row for, live or soft-deleted. A deleted row
 * counts: someone removed that tag on purpose, so a later classifier must not bring it back.
 */
export async function readRelatedSubjectTopicIds(
  query: QueryExecutor,
  relationTable: string,
  subjectId: string,
  topicIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const statement = sql`/* readRelatedClassifierSubjectTopics */
    SELECT DISTINCT relation.object_id AS topic_id
    FROM `
  statement.append(
    assertWhitelistedSqlIdentifier(
      relationTable,
      entityRelationElectionTables,
      'entityRelationTable',
    ),
  )
  statement.append(sql` relation
    WHERE relation.subject_id = ${subjectId}::uuid
      AND relation.object_id = ANY(${[...topicIds]}::uuid[])
  `)
  const { rows } = await query<{ topic_id: string }>(statement)
  return new Set(rows.map(row => row.topic_id))
}

/** The subject's live topic relations among the given topics, with their current net votes. */
export async function readActiveSubjectTopicRelations(
  query: QueryExecutor,
  relationTable: string,
  subjectId: string,
  topicIds: readonly string[],
): Promise<ActiveSubjectTopicRelation[]> {
  const statement = sql`/* readActiveClassifierSubjectTopicRelations */
    SELECT relation.id, relation.object_id AS topic_id, relation.votes_score_net AS net_score
    FROM `
  statement.append(
    assertWhitelistedSqlIdentifier(
      relationTable,
      entityRelationElectionTables,
      'entityRelationTable',
    ),
  )
  statement.append(sql` relation
    WHERE relation.subject_id = ${subjectId}::uuid
      AND relation.object_id = ANY(${[...topicIds]}::uuid[])
      AND relation.deleted_at IS NULL
    ORDER BY relation.id
  `)
  const { rows } = await query<{ id: string; topic_id: string; net_score: number }>(statement)
  return rows.map(row => ({ id: row.id, topicId: row.topic_id, netScore: row.net_score }))
}
