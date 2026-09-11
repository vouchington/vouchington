import sql, { type SQLStatement } from 'sql-template-strings'

export function buildCountQuery(baseQuery: SQLStatement): SQLStatement {
  const countQuery = sql`/* buildCountQuery */
    SELECT COUNT(*) as total_count
    FROM (
  `
  countQuery.append(baseQuery)
  countQuery.append(sql`
    ) AS search_results
  `)
  return countQuery
}
