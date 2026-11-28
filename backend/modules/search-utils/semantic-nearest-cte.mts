import sql, { type SQLStatement } from 'sql-template-strings'

type SemanticNearestLateralAnchorCte =
  | 'similar_topic_embedding'
  | 'similar_post_embedding'
  | 'similar_rss_feed_item_embedding'

const LATERAL_ANCHOR_SQL: Readonly<Record<SemanticNearestLateralAnchorCte, string>> = {
  similar_topic_embedding: 'similar_topic_embedding',
  similar_post_embedding: 'similar_post_embedding',
  similar_rss_feed_item_embedding: 'similar_rss_feed_item_embedding',
}

type SemanticNearestCteOptions = {
  selectColumns: readonly string[]
  from: string
  embeddingColumn: string
  whereClauses: readonly (string | SQLStatement)[]
  candidateLimit: number
  maxCandidateLimit: number
  lateralAnchor?: {
    cte: SemanticNearestLateralAnchorCte
    outerSelectColumns: readonly string[]
  }
}

function appendBoundedNearestSelect(
  query: SQLStatement,
  options: {
    selectColumns: readonly string[]
    from: string
    embeddingColumn: string
    anchorEmbeddingRef: string
    whereClauses: readonly (string | SQLStatement)[]
    candidateLimit: number
    maxCandidateLimit: number
  },
): SQLStatement {
  query
    .append(sql`SELECT
        `)
    .append(options.selectColumns.join(',\n        '))
    .append(sql`,
        (`)
    .append(options.embeddingColumn)
    .append(sql` <=> `)
    .append(options.anchorEmbeddingRef)
    .append(sql`) AS embedding_distance
      FROM `)
    .append(options.from)

  if (options.anchorEmbeddingRef === 'semantic_search_embedding.embedding') {
    query.append(sql`
      CROSS JOIN semantic_search_embedding`)
  }

  query.append(sql`
      WHERE `)

  for (const clause of options.whereClauses) {
    query.append(clause).append(sql` AND `)
  }

  return query
    .append(options.embeddingColumn)
    .append(sql` IS NOT NULL
      ORDER BY `)
    .append(options.embeddingColumn)
    .append(sql` <=> `)
    .append(options.anchorEmbeddingRef)
    .append(sql`
      LIMIT LEAST(`)
    .append(String(options.candidateLimit))
    .append(sql`, `)
    .append(String(options.maxCandidateLimit))
    .append(sql`)`)
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
  lateralAnchor,
}: SemanticNearestCteOptions): SQLStatement {
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error('Invalid semantic candidate limit')
  }
  if (!Number.isSafeInteger(maxCandidateLimit) || maxCandidateLimit < 1) {
    throw new Error('Invalid semantic candidate hard maximum')
  }

  if (!lateralAnchor) {
    const query = sql`semantic_nearest AS MATERIALIZED (
      `
    appendBoundedNearestSelect(query, {
      selectColumns,
      from,
      embeddingColumn,
      anchorEmbeddingRef: 'semantic_search_embedding.embedding',
      whereClauses,
      candidateLimit,
      maxCandidateLimit,
    })
    return query.append(sql`
    )`)
  }

  const query = sql`semantic_nearest AS MATERIALIZED (
      SELECT
        `
    .append(lateralAnchor.outerSelectColumns.join(',\n        '))
    .append(sql`,
        nearest.embedding_distance
      FROM `)
    .append(LATERAL_ANCHOR_SQL[lateralAnchor.cte]).append(sql` anchor_embedding
      CROSS JOIN LATERAL (
        `)
  appendBoundedNearestSelect(query, {
    selectColumns,
    from,
    embeddingColumn,
    anchorEmbeddingRef: 'anchor_embedding.embedding',
    whereClauses,
    candidateLimit,
    maxCandidateLimit,
  })
  return query.append(sql`
      ) nearest
    )`)
}
