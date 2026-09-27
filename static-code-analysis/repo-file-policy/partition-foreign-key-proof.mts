import createEntityRelationsSql from '../../backend/data-stores/psql/config-driven/0000-00-01-entity-relations.mts'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '../../backend/types/entities/entity-relations-metadata.mts'

/** Prove every generated LIST child has its concrete composite target FK. */
export function verifyEntityRelationVotePartitionForeignKeys(
  sql = createEntityRelationsSql(),
): string[] {
  const errors: string[] = []
  for (const metadata of entityRelationMetadatum.filter(item => item.election)) {
    const voteTable = getEntityRelationVoteTableName(metadata)
    const partition = `CREATE TABLE IF NOT EXISTS ${voteTable}
PARTITION OF entity_relation_votes (
  FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE
)
FOR VALUES IN ('${metadata.table_name}')`
    if (sql.includes(partition)) continue
    errors.push(
      `::error file=backend/data-stores/psql/config-driven/0000-00-01-entity-relations.mts::${voteTable} must have a concrete (subject_id, entity_relation_id) FK to ${metadata.table_name}`,
    )
  }
  return errors
}
