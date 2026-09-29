import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { EntityRelationElectionTarget } from '@queues/elections/types'
import { createEntityRelationElectionTarget, entityRelationElectionTables } from './target.mts'

const relationTableSelects = [...entityRelationElectionTables].map(
  table => `SELECT '${table}'::text AS relation_table FROM "${table}"
      WHERE id = $1 AND deleted_at IS NULL`,
)

/**
 * Resolves a bare relation id from a route to its concrete election target. Routes cannot name
 * a relation table, so an id present in more than one election table is rejected with 409
 * rather than resolved to an arbitrary family. Deliberately uncached: caching the resolution
 * by bare id would recreate the ambiguous key.
 */
export async function resolveEntityRelationElectionTargetById(
  entityRelationId: string,
): Promise<EntityRelationElectionTarget | null> {
  if (!isUUID(entityRelationId)) {
    throw createError(422, `Invalid entity relation ID: ${entityRelationId}`)
  }
  const { rows } = await read<{ relation_table: string }>(
    `/* resolveEntityRelationElectionTargetById */
    ${relationTableSelects.join('\n    UNION ALL\n    ')}
    LIMIT 2`,
    [entityRelationId],
  )
  if (rows.length > 1) {
    throw createError(409, 'Entity relation id is ambiguous across relation families')
  }
  return rows[0]
    ? createEntityRelationElectionTarget(entityRelationId, rows[0].relation_table)
    : null
}
