/**
 * Entity relations helpers
 */

import { read, write } from '@data-stores/psql'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'

export {
  countPostRelatedTopics,
  getTestRelationDeletedAt,
  hasPostRelatedTopic,
  insertScoredPostTopicCategoryRelation,
  setScoredPostTopicCategoryRelationScore,
  softDeleteScoredPostTopicCategoryRelation,
} from './entity-relations-posts.mts'

const ALLOWED_RELATION_TABLES = new Set(
  entityRelationMetadatum.map(relation => relation.table_name),
)

function validateRelationTable(tableName: string): void {
  if (!ALLOWED_RELATION_TABLES.has(tableName)) {
    throw new Error(`Invalid relation table name: ${tableName}`)
  }
}

function buildWhereClause(subjectId: string, objectId: string): ReturnType<typeof sql> {
  return sql`subject_id = ${subjectId} AND object_id = ${objectId}`
}

export async function insertEntityRelation(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<void> {
  validateRelationTable(tableName)
  await write(
    sql`INSERT INTO `
      .append(tableName)
      .append(
        sql` (subject_id, object_id) VALUES (${subjectId}, ${objectId}) ON CONFLICT DO NOTHING`,
      ),
  )
}

export async function updateTestEntityRelationCreatedAt(
  tableName: string,
  subjectId: string,
  objectId: string,
  createdAt: Date,
): Promise<void> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`UPDATE `
      .append(tableName)
      .append(sql` SET created_at = ${createdAt} WHERE `)
      .append(whereClause),
  )
}

export async function getEntityRelation(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<unknown[]> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  const { rows } = await read(
    sql`SELECT * FROM `
      .append(tableName)
      .append(sql` WHERE `)
      .append(whereClause),
  )
  return rows
}

export async function getEntityRelationVoteStorageRows(
  entityRelationIds: string[],
): Promise<Array<{ entity_relation_id: string; storage_table: string }>> {
  const { rows } = await read(sql`/* getEntityRelationVoteStorageRows */
    SELECT entity_relation_id, tableoid::regclass::text AS storage_table
    FROM entity_relation_votes
    WHERE entity_relation_id = ANY(${entityRelationIds}::uuid[])
    ORDER BY entity_relation_id
  `)
  return rows as Array<{ entity_relation_id: string; storage_table: string }>
}

export async function setTestEntityRelationIdAndScore(
  tableName: string,
  subjectId: string,
  objectId: string,
  id: string,
  votesScoreUp: number,
): Promise<void> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`UPDATE `
      .append(tableName)
      .append(sql` SET id = ${id}, votes_score_up = ${votesScoreUp} WHERE `)
      .append(whereClause),
  )
}

export async function hardDeleteEntityRelationTest(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<void> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`/* hardDeleteEntityRelationTest */ DELETE FROM `
      .append(tableName)
      .append(sql`
    WHERE `)
      .append(whereClause),
  )
}

export async function softDeleteEntityRelationTest(
  tableName: string,
  subjectId: string,
  objectId: string,
  deletedById?: string,
): Promise<void> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  const updateQuery = sql`UPDATE `
    .append(tableName)
    .append(sql` SET deleted_at = CURRENT_TIMESTAMP`)
  if (deletedById) updateQuery.append(sql`, deleted_by_id = ${deletedById}`)
  updateQuery.append(sql` WHERE `).append(whereClause)
  await write(updateQuery)
}

export async function setEntityRelationDeletedAt(
  tableName: string,
  subjectId: string,
  objectId: string,
  deletedAt: Date,
): Promise<void> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`UPDATE `
      .append(tableName)
      .append(sql` SET deleted_at = ${deletedAt} WHERE `)
      .append(whereClause),
  )
}

export async function setEntityRelationCreatedAt(
  tableName: string,
  subjectId: string,
  objectId: string,
  createdAt: Date,
): Promise<void> {
  validateRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`UPDATE `
      .append(tableName)
      .append(sql` SET created_at = ${createdAt} WHERE `)
      .append(whereClause),
  )
}

export async function getMentionRowsForRelationTable(
  tableName: string,
  postId: string,
): Promise<
  Array<{
    subject_id: string
    deleted_at: Date | null
  }>
> {
  const allowedTables = new Set([
    'relation__user__mentioned__post',
    'relation__topic__mentioned__post',
    'relation__post__mentioned__post',
  ])
  if (!allowedTables.has(tableName)) {
    throw new Error(`Invalid mention relation table name: ${tableName}`)
  }
  const { rows } = await read(
    sql`
    SELECT subject_id, deleted_at
    FROM `.append(tableName).append(sql`
    WHERE object_id = ${postId}
    ORDER BY subject_id ASC
  `),
  )
  return rows as Array<{ subject_id: string; deleted_at: Date | null }>
}
