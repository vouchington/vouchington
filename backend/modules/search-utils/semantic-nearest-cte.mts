import sql, { type SQLStatement } from 'sql-template-strings'

type SemanticNearestCteOptions = {
  selectColumns: readonly string[]
  from: string
  embeddingColumn: string
  whereClauses: readonly (string | SQLStatement)[]
  candidateLimit: number
  maxCandidateLimit: number
}

/**
 * Builds the bounded `semantic_nearest AS MATERIALIZED (...)` HNSW k-nearest prefix CTE.
 *
 * Vector search carve-out in `.agents/skills/vouchington-postgres/SKILL.md` (Query shape):
 * pgvector requires an HNSW k-nearest prefix (`ORDER BY <=> LIMIT k`) with a bounded DynamicConfig
 * `k` and hard maximum bound in SQL. Both integers are validated with `Number.isSafeInteger` so
 * PostgreSQL folds `LEAST(k, max)` before generic planning and prices the HNSW index accurately.
 */
export function buildSemanticNearestCte({
  selectColumns,
  from,
  embeddingColumn,
  whereClauses,
  candidateLimit,
  maxCandidateLimit,
}: SemanticNearestCteOptions): SQLStatement {
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error('Invalid semantic candidate limit')
  }
  if (!Number.isSafeInteger(maxCandidateLimit) || maxCandidateLimit < 1) {
    throw new Error('Invalid semantic candidate hard maximum')
  }

  const query = sql`semantic_nearest AS MATERIALIZED (
      SELECT
        `
    .append(selectColumns.join(',\n        '))
    .append(sql`,
        (`)
    .append(embeddingColumn)
    .append(sql` <=> semantic_search_embedding.embedding) AS embedding_distance
      FROM `)
    .append(from).append(sql`
      CROSS JOIN semantic_search_embedding
      WHERE `)

  for (const clause of whereClauses) {
    query.append(clause).append(sql` AND `)
  }

  return query
    .append(embeddingColumn)
    .append(sql` IS NOT NULL
      ORDER BY `)
    .append(embeddingColumn)
    .append(sql` <=> semantic_search_embedding.embedding
      LIMIT LEAST(`)
    .append(String(candidateLimit))
    .append(sql`, `)
    .append(String(maxCandidateLimit)).append(sql`)
    )`)
}
