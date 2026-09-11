import sql, { type SQLStatement } from 'sql-template-strings'

export function buildDiscoveryStateClause(
  candidateAlias: string,
  rootAlias: string,
  requireUnarchived = true,
): SQLStatement {
  const statement = sql`(`
  if (requireUnarchived)
    statement
      .append(`${candidateAlias}.archived_at IS NULL`)
      .append(sql` AND `)
      .append(`${rootAlias}.archived_at IS NULL`)
      .append(sql` AND `)
  return statement
    .append(sql`NOT EXISTS (
      SELECT 1
      FROM user_suspensions publication_suspension
      WHERE publication_suspension.user_id = `)
    .append(`${candidateAlias}.created_by_id`)
    .append(sql`
        AND publication_suspension.lifted_at IS NULL
    ) AND NOT EXISTS (
      SELECT 1
      FROM user_suspensions publication_root_suspension
      WHERE publication_root_suspension.user_id = `)
    .append(`${rootAlias}.created_by_id`).append(sql`
        AND publication_root_suspension.lifted_at IS NULL
    )
  )`)
}
