import sql, { type SQLStatement } from 'sql-template-strings'

export function appendSupportAgentRunStatus(query: SQLStatement): void {
  query.append(sql`
      CASE
        WHEN failed_at IS NOT NULL THEN 'failed'
        WHEN completed_at IS NOT NULL THEN 'completed'
        ELSE 'running'
      END AS status
  `)
}
