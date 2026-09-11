import sql, { type SQLStatement } from 'sql-template-strings'

type ExcludedRelationConfig = {
  relationTable: string
  idColumn: string
  cteAlias: string
}

export function buildExcludedCTE(
  userId: string,
  config: ExcludedRelationConfig,
  additionalTables: string[] = [],
): SQLStatement {
  const query = sql`/* buildExcludedCTE:fragment */
    `
    .append(config.cteAlias)
    .append(sql` AS (
      SELECT object_id AS `)
    .append(config.idColumn)
    .append(sql`
      FROM `)
    .append(config.relationTable).append(sql`
      WHERE subject_id = ${userId}
        AND deleted_at IS NULL`)

  for (const table of additionalTables) {
    query
      .append(sql`
      UNION
      SELECT object_id AS `)
      .append(config.idColumn)
      .append(sql`
      FROM `)
      .append(table).append(sql`
      WHERE subject_id = ${userId}
        AND deleted_at IS NULL`)
  }

  query.append(sql`
    )`)

  return query
}
