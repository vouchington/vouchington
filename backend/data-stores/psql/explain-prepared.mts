import type { PoolClient } from 'pg'

export function buildExplainPreparedStatementText(
  name: string,
  argumentSql: readonly string[],
): string {
  const argumentsSql = argumentSql.join(', ')
  const executionSql = argumentsSql ? `EXECUTE ${name}(${argumentsSql})` : `EXECUTE ${name}`
  return `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) ${executionSql}`
}

export async function buildPreparedArgumentSql(
  client: PoolClient,
  preparedStatementName: string,
  values: readonly unknown[],
): Promise<string[]> {
  const { rows: parameterTypes } = await client.query<{ parameter_type: string }>(
    `/* explainAnalyze */
      SELECT parameter_type::text
      FROM pg_prepared_statements
      CROSS JOIN LATERAL unnest(parameter_types) WITH ORDINALITY AS parameters(parameter_type, position)
      WHERE name = $1
      ORDER BY position`,
    [preparedStatementName],
  )
  if (parameterTypes.length !== values.length) {
    throw new Error(
      `Prepared EXPLAIN parameter mismatch: expected ${parameterTypes.length}, received ${values.length}`,
    )
  }

  if (parameterTypes.length === 0) return []

  const quoteExpressions = parameterTypes.map(
    ({ parameter_type }, index) => `quote_nullable($${index + 1}::${parameter_type})`,
  )
  const { rows } = await client.query<{ literals: string[] }>(
    `/* explainAnalyze */ SELECT ARRAY[${quoteExpressions.join(', ')}] AS literals`,
    [...values],
  )
  const literals = rows[0]?.literals ?? []
  return parameterTypes.map(
    ({ parameter_type }, index) => `${literals[index] ?? 'NULL'}::${parameter_type}`,
  )
}
