import type { EntityRelationEntityType } from '@services/entity-relations/config'
import {
  entityRelationMetadatum,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { read } from '@data-stores/psql'

export type BookmarkRow = { object_id: string; _bookmark_type: string }
type BookmarkRelation = Pick<EntityRelationMetadata, 'table_name' | 'predicate'>

export async function queryBookmarksForAllRelations(
  userId: string,
  entityTypeName: EntityRelationEntityType,
  relations: BookmarkRelation[],
  objectIds: string[],
): Promise<Record<string, Record<string, boolean>>> {
  if (relations.length === 0 || objectIds.length === 0) return {}
  const safeRelations = relations.map(relation =>
    assertValidBookmarkRelation(relation, entityTypeName),
  )

  const rows = await queryEntityBookmarksForRelations(userId, safeRelations, objectIds)
  return mapBookmarkRowsToOutput([rows])
}

export async function queryBookmarksForRelation(
  userId: string,
  entityTypeName: EntityRelationEntityType,
  relation: BookmarkRelation,
  objectIds: string[],
): Promise<BookmarkRow[]> {
  if (objectIds.length === 0) return []
  const safeRelation = assertValidBookmarkRelation(relation, entityTypeName)

  return await queryEntityBookmarks(userId, safeRelation, objectIds)
}

export function mapBookmarkRowsToOutput(
  relationRows: BookmarkRow[][],
): Record<string, Record<string, boolean>> {
  const output: Record<string, Record<string, boolean>> = {}
  for (const rows of relationRows) {
    for (const row of rows) {
      output[row.object_id] ||= {}
      output[row.object_id][row._bookmark_type] = true
    }
  }
  return output
}

async function queryEntityBookmarksForRelations(
  userId: string,
  relations: BookmarkRelation[],
  objectIds: string[],
): Promise<BookmarkRow[]> {
  const subqueries = relations.map(relation => {
    return `
      SELECT
        object_id,
        '${relation.predicate}' AS _bookmark_type
      FROM ${relation.table_name}
      WHERE subject_id = $1
        AND object_id = ANY($2)
        AND deleted_at IS NULL
    `
  })

  const { rows } = await read(
    `/* queryEntityBookmarksForRelations */ ${subqueries.join(' UNION ALL ')}`,
    [userId, objectIds],
  )
  return rows as BookmarkRow[]
}

function queryEntityBookmarks(
  userId: string,
  relation: BookmarkRelation,
  objectIds: string[],
): Promise<BookmarkRow[]> {
  return queryEntityBookmarksForRelations(userId, [relation], objectIds)
}

function assertValidBookmarkRelation(
  relation: BookmarkRelation,
  entityTypeName: EntityRelationEntityType,
): EntityRelationMetadata {
  const safeRelation = entityRelationMetadatum.find(
    relationData =>
      relationData.subject_type === 'user' &&
      relationData.is_bookmark &&
      relationData.object_type === entityTypeName &&
      relationData.table_name === relation.table_name &&
      relationData.predicate === relation.predicate,
  )
  if (!safeRelation) {
    throw new Error(`Unknown user bookmark relation: ${relation.table_name}:${relation.predicate}`)
  }
  return safeRelation
}
