export function createVoteDefaultPartitionSql(voteTable: string): string {
  return `CREATE TABLE IF NOT EXISTS ${voteTable}__default
PARTITION OF ${voteTable} DEFAULT;`
}

export function createVoteIndexesSql(voteTable: string, entityIdColumn: string): string {
  return `CREATE INDEX IF NOT EXISTS idx_${voteTable}__${entityIdColumn}__uid__id
ON ${voteTable} (${entityIdColumn}, user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_${voteTable}__${entityIdColumn}__id
ON ${voteTable} (${entityIdColumn}, id);

CREATE INDEX IF NOT EXISTS idx_${voteTable}__uid__${entityIdColumn}__id
ON ${voteTable} (user_id, ${entityIdColumn}, id DESC);`
}
