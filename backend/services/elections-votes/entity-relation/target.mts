import { assertWhitelistedSqlIdentifier, read } from '@data-stores/psql'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import type {
  EntityRelationElectionTable,
  EntityRelationElectionTarget,
} from '@queues/elections/types'
import sql from 'sql-template-strings'

export const entityRelationElectionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)

export function createEntityRelationElectionTarget(
  entityRelationId: string,
  relationTable: unknown,
): EntityRelationElectionTarget {
  if (typeof relationTable !== 'string' || !entityRelationElectionTables.has(relationTable)) {
    throw new Error(`Unknown election entity-relation table: ${String(relationTable)}`)
  }
  return { entityRelationId, relationTable: relationTable as EntityRelationElectionTable }
}

export async function resolveEntityRelationElectionTarget(
  entityRelationId: string,
  relationTable: unknown,
): Promise<EntityRelationElectionTarget> {
  if (relationTable !== undefined) {
    return createEntityRelationElectionTarget(entityRelationId, relationTable)
  }

  const query = sql`/* resolveEntityRelationElectionTarget:legacyQueueJob */
    SELECT relation_table
    FROM (`
  for (const [index, candidateTable] of [...entityRelationElectionTables].toSorted().entries()) {
    if (index > 0) query.append(sql` UNION ALL `)
    query.append(sql`SELECT ${candidateTable}::text AS relation_table FROM `)
    query.append(
      assertWhitelistedSqlIdentifier(
        candidateTable,
        entityRelationElectionTables,
        'entityRelationTable',
      ),
    )
    query.append(sql` WHERE id = ${entityRelationId}`)
  }
  query.append(sql`) AS matching_relations LIMIT 2`)

  const { rows } = await read<{ relation_table: string }>(query)
  if (rows.length !== 1) {
    throw new Error(
      `Unable to resolve election entity-relation table for legacy queue job: ${entityRelationId}`,
    )
  }
  return createEntityRelationElectionTarget(entityRelationId, rows[0]!.relation_table)
}
