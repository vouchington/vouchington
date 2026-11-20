import sql, { type SQLStatement } from 'sql-template-strings'

export { buildHotScoreExpression } from '@modules/feed-query-builders/hot-score'

export function buildPostRankingScoreExpression(options: {
  hasTextSearch: boolean
  hasSemanticSearch: boolean
}): SQLStatement | null {
  if (options.hasTextSearch && !options.hasSemanticSearch) {
    return sql`ts_rank(posts.search_vector, text_search_tsquery.tsquery, 0)`
  }

  if (options.hasSemanticSearch && !options.hasTextSearch) {
    return sql`(1.0 / (1.0 + (posts.gemini_embedding_2_embedding <=> semantic_search_embedding.embedding)))`
  }

  if (options.hasTextSearch && options.hasSemanticSearch) {
    // Hybrid search: multiply text rank by semantic score.
    return sql`(
      ts_rank(posts.search_vector, text_search_tsquery.tsquery, 0) *
      (1.0 / (1.0 + (posts.gemini_embedding_2_embedding <=> semantic_search_embedding.embedding)))
    )`
  }

  return null
}
