import type { EntityRelationEntityType } from '@services/entity-relations/config'
import {
  entityRelationMetadatum,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { read } from '@data-stores/psql'

export type BookmarkRow = { object_id: string; _bookmark_type: string }
type BookmarkRelation = Pick<EntityRelationMetadata, 'table_name' | 'predicate'>

export type BookmarkRelationPlan = {
  entityTypeName: EntityRelationEntityType
  relations: BookmarkRelation[]
  objectIds: string[]
}

export async function queryBookmarksForAllRelations(
  userId: string,
  entityTypeName: EntityRelationEntityType,
  relations: BookmarkRelation[],
  objectIds: string[],
): Promise<Record<string, Record<string, boolean>>> {
  if (relations.length === 0 || objectIds.length === 0) return {}
  const rows = await queryEntityBookmarksForRelationPlans(userId, [
    { entityTypeName, relations, objectIds },
  ])
  return mapBookmarkRowsToOutput([rows])
}

export async function queryBookmarksForRelationPlans(
  userId: string,
  plans: BookmarkRelationPlan[],
): Promise<Record<string, Record<string, boolean>>> {
  const rows = await queryEntityBookmarksForRelationPlans(userId, plans)
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

  return queryEntityBookmarksForRelationPlans(userId, [
    { entityTypeName, relations: [safeRelation], objectIds },
  ])
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

async function queryEntityBookmarksForRelationPlans(
  userId: string,
  plans: BookmarkRelationPlan[],
): Promise<BookmarkRow[]> {
  const parameters: unknown[] = [userId]
  const subqueries: string[] = []
  for (const plan of plans) {
    const safeRelations = plan.relations.map(relation =>
      assertValidBookmarkRelation(relation, plan.entityTypeName),
    )
    if (plan.objectIds.length === 0) continue
    const objectIdsParameter = parameters.push(plan.objectIds)
    for (const relation of safeRelations) {
      subqueries.push(`
        SELECT object_id, '${relation.predicate}' AS _bookmark_type
        FROM ${relation.table_name}
        WHERE subject_id = $1
          AND object_id = ANY($${objectIdsParameter}::uuid[])
          AND deleted_at IS NULL
      `)
    }
  }
  if (subqueries.length === 0) return []

  const { rows } = await read(
    `/* queryEntityBookmarksForRelations */ \n      ${subqueries.join(' UNION ALL ')}`,
    parameters,
  )
  return rows as BookmarkRow[]
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
