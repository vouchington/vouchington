import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import type {
  EntityRelationElectionTable,
  EntityRelationElectionTarget,
} from '@queues/elections/types'

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
