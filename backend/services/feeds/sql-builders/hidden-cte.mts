import sql, { type SQLStatement } from 'sql-template-strings'
import type { RelationConfig } from './types.mts'

export function buildHiddenCTE(userId: string, config: RelationConfig): SQLStatement {
  const query = sql`/* buildHiddenCTE:fragment */`
    .append(config.cteAlias)
    .append(sql` AS (
      SELECT object_id AS `)
    .append(config.idColumn!)
    .append(sql`
      FROM `)
    .append(config.relationTable).append(sql`
      WHERE subject_id = ${userId}
        AND deleted_at IS NULL
    )`)

  return query
}
