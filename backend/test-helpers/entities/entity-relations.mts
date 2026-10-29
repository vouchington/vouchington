/**
 * Entity relations helpers
 */

import { read, write } from '@data-stores/psql'
import { getTestEntityRelationTable } from './entity-relation-fixture-tables.mts'
import sql from 'sql-template-strings'

function buildWhereClause(subjectId: string, objectId: string): ReturnType<typeof sql> {
  return sql`subject_id = ${subjectId} AND object_id = ${objectId}`
}

export async function insertEntityRelation(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<void> {
  const relationTable = getTestEntityRelationTable(tableName)
  await write(
    sql`/* insertEntityRelation */ INSERT INTO `
      .append(relationTable)
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
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`/* updateTestEntityRelationCreatedAt */ UPDATE `
      .append(relationTable)
      .append(sql` SET created_at = ${createdAt} WHERE `)
      .append(whereClause),
  )
}

export async function getEntityRelation(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<unknown[]> {
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  const { rows } = await read(
    sql`/* getEntityRelation */ SELECT * FROM `
      .append(relationTable)
      .append(sql` WHERE `)
      .append(whereClause),
  )
  return rows
}

export async function setTestEntityRelationIdAndScore(
  tableName: string,
  subjectId: string,
  objectId: string,
  id: string,
  votesScoreUp: number,
): Promise<void> {
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`/* setTestEntityRelationIdAndScore */ UPDATE `
      .append(relationTable)
      .append(sql` SET id = ${id}, votes_score_up = ${votesScoreUp} WHERE `)
      .append(whereClause),
  )
}

export async function hardDeleteEntityRelationTest(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<void> {
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`/* hardDeleteEntityRelationTest */ DELETE FROM `
      .append(relationTable)
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
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  const updateQuery = sql`/* softDeleteEntityRelationTest */ UPDATE `
    .append(relationTable)
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
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`/* setEntityRelationDeletedAt */ UPDATE `
      .append(relationTable)
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
  const relationTable = getTestEntityRelationTable(tableName)
  const whereClause = buildWhereClause(subjectId, objectId)
  await write(
    sql`/* setEntityRelationCreatedAt */ UPDATE `
      .append(relationTable)
      .append(sql` SET created_at = ${createdAt} WHERE `)
      .append(whereClause),
  )
}

export { getMentionRowsForRelationTable } from './entity-relation-mentions.mts'

export { getEntityRelationVoteStorageRows } from './entity-relation-vote-storage.mts'
