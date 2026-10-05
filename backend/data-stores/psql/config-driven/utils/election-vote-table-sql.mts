import { getElectionIndexName } from './election-sql-identifiers.mts'
export function createVoteDefaultPartitionSql(voteTable: string): string {
  return `CREATE TABLE IF NOT EXISTS ${voteTable}__default
PARTITION OF ${voteTable} DEFAULT;`
}

export function createVoteIndexesSql(voteTable: string, entityIdColumn: string): string {
  const key = entityIdColumn === 'entity_relation_id' ? 'relation' : entityIdColumn
  const actor = entityIdColumn === 'entity_relation_id' ? 'user' : 'user_id'
  return `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(voteTable, `${key}__${actor}__id`)}
ON ${voteTable} (${entityIdColumn}, user_id, id DESC);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(voteTable, `${key}__id`)}
ON ${voteTable} (${entityIdColumn}, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(voteTable, `${actor}__${key}__id`)}
ON ${voteTable} (user_id, ${entityIdColumn}, id DESC);`
}
