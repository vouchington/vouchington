import sql, { type SQLStatement } from 'sql-template-strings'
import { buildSemanticDistanceScore } from '@modules/search-utils'
import type { TopicSearchState, TopicSimilarityAnchorCte } from './query-builder-state.mts'

const SECONDARY_DISTANCE_EXPRESSION: Readonly<Record<TopicSimilarityAnchorCte, string>> = {
  similar_topic_embedding:
    't.bedrock_nova_multimodal_v1_embedding <=> similar_topic_embedding.embedding',
  similar_post_embedding:
    't.bedrock_nova_multimodal_v1_embedding <=> similar_post_embedding.embedding',
  similar_rss_feed_item_embedding:
    't.bedrock_nova_multimodal_v1_embedding <=> similar_rss_feed_item_embedding.embedding',
}

export function buildTopicSemanticRankingScoreSql(
  state: Pick<TopicSearchState, 'semanticAnchorCte' | 'secondarySemanticCtes'>,
): SQLStatement {
  if (!state.semanticAnchorCte) {
    throw new Error(
      'buildTopicSemanticRankingScoreSql requires at least one semantic/similar search signal',
    )
  }

  const scoreExpressions: SQLStatement[] = [
    buildSemanticDistanceScore('t.embedding_distance'),
    ...state.secondarySemanticCtes.map(cte =>
      buildSemanticDistanceScore(SECONDARY_DISTANCE_EXPRESSION[cte]),
    ),
  ]
  if (scoreExpressions.length === 1) return scoreExpressions[0]!

  const ranking = sql`(`
  scoreExpressions.forEach((expr, index) => {
    if (index > 0) ranking.append(sql` * `)
    ranking.append(expr)
  })
  return ranking.append(sql`)`)
}

// Escape LIKE metacharacters so they are treated as literals in prefix-match CASE expressions
export function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
