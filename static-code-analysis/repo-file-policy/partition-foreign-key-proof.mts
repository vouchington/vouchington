import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
  type EntityRelationMetadata,
} from '../../backend/types/entities/entity-relations-metadata.mts'

const ENTITY_RELATION_SQL_PATH =
  'backend/data-stores/psql/config-driven/0000-00-01-entity-relations.mts'

/** Prove every generated LIST child has its concrete composite target FK. */
export function verifyEntityRelationVotePartitionForeignKeys(
  sql: string,
  relations: readonly EntityRelationMetadata[] = entityRelationMetadatum,
): string[] {
  const errors: string[] = []
  for (const metadata of relations.filter(item => item.election)) {
    const voteTable = getEntityRelationVoteTableName(metadata)
    const partition = `CREATE TABLE IF NOT EXISTS ${voteTable}
PARTITION OF entity_relation_votes (
  FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE
)
FOR VALUES IN ('${metadata.table_name}')`
    if (sql.includes(partition)) continue
    errors.push(
      `::error file=${ENTITY_RELATION_SQL_PATH}::${voteTable} must have a concrete (subject_id, entity_relation_id) FK to ${metadata.table_name}`,
    )
  }
  return errors
}

/** Load the target checkout's generator. Do not import the scanner checkout's copy. */
export async function readTargetEntityRelationSql(repoRoot: string): Promise<string> {
  const file = join(repoRoot, ENTITY_RELATION_SQL_PATH)
  const imported = (await import(pathToFileURL(file).href)) as { default?: unknown }
  if (typeof imported.default !== 'function') {
    throw new TypeError(`${ENTITY_RELATION_SQL_PATH} must export a default SQL generator`)
  }
  const sql = await (imported.default as () => unknown)()
  if (typeof sql !== 'string') {
    throw new TypeError(`${ENTITY_RELATION_SQL_PATH} must generate SQL text`)
  }
  return sql
}

export async function verifyEntityRelationVotePartitionForeignKeysAt(
  repoRoot: string,
  loadSql: (root: string) => Promise<string> = readTargetEntityRelationSql,
): Promise<string[]> {
  return verifyEntityRelationVotePartitionForeignKeys(await loadSql(repoRoot))
}
