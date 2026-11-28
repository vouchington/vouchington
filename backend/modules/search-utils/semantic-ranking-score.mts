import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Converts one cosine-distance SQL expression into its `1 / (1 + distance)` ranking factor.
 */
export function buildSemanticDistanceScore(distanceExpression: string): SQLStatement {
  return sql`(1.0 / (1.0 + (`.append(distanceExpression).append(sql`)))`)
}

/**
 * Builds a geometric-mean-style semantic ranking score expression.
 * Each active signal contributes a `1/(1+distance)` factor; they are multiplied together.
 *
 * @param embeddingColumn - Raw SQL column reference, e.g. `t.bedrock_nova_multimodal_v1_embedding`
 * @param signals - Which similarity CTEs are present in the query
 */
export function buildSemanticRankingScore(
  embeddingColumn: string,
  signals: {
    hasSemanticSearch: boolean
    hasSimilarPostSearch: boolean
    hasSimilarTopicSearch: boolean
    hasSimilarRssFeedItemSearch: boolean
  },
): SQLStatement {
  const {
    hasSemanticSearch,
    hasSimilarPostSearch,
    hasSimilarTopicSearch,
    hasSimilarRssFeedItemSearch,
  } = signals

  if (
    !hasSemanticSearch &&
    !hasSimilarPostSearch &&
    !hasSimilarTopicSearch &&
    !hasSimilarRssFeedItemSearch
  ) {
    throw new Error(
      'buildSemanticRankingScore requires at least one semantic/similar search signal',
    )
  }

  const scoreExpressions: SQLStatement[] = []

  if (hasSemanticSearch) {
    scoreExpressions.push(
      buildSemanticDistanceScore(`${embeddingColumn} <=> semantic_search_embedding.embedding`),
    )
  }
  if (hasSimilarPostSearch) {
    scoreExpressions.push(
      buildSemanticDistanceScore(`${embeddingColumn} <=> similar_post_embedding.embedding`),
    )
  }
  if (hasSimilarTopicSearch) {
    scoreExpressions.push(
      buildSemanticDistanceScore(`${embeddingColumn} <=> similar_topic_embedding.embedding`),
    )
  }
  if (hasSimilarRssFeedItemSearch) {
    scoreExpressions.push(
      buildSemanticDistanceScore(
        `${embeddingColumn} <=> similar_rss_feed_item_embedding.embedding`,
      ),
    )
  }

  const ranking = sql`(`
  scoreExpressions.forEach((expr, index) => {
    if (index > 0) ranking.append(sql` * `)
    ranking.append(expr)
  })
  ranking.append(sql`)`)
  return ranking
}
