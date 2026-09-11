import { entityRelationMetadatum } from './metadata.mts'

export function getEntityRelationUrlTables(): string[] {
  return entityRelationMetadatum.flatMap(metadata =>
    metadata.object_type === 'url' ? [metadata.table_name] : [],
  )
}

export function getEntityRelationUrlTablesWithElections(): string[] {
  return entityRelationMetadatum.flatMap(metadata =>
    metadata.object_type === 'url' && metadata.election ? [metadata.table_name] : [],
  )
}

export function positiveVoteConditions(tables: string[]): string[] {
  return tables.map(
    table =>
      `EXISTS (
        SELECT 1 FROM "${table}" er
        WHERE er.object_id = u.id AND er.deleted_at IS NULL AND er.votes_score_net > 0
      )`,
  )
}
