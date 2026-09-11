import { type SQLStatement } from 'sql-template-strings'
import { buildSemanticRankingScore } from '@modules/search-utils'

export function buildTopicSemanticRankingScoreSql(signals: {
  hasSemanticSearch: boolean
  hasSimilarPostSearch: boolean
  hasSimilarTopicSearch: boolean
  hasSimilarRssFeedItemSearch: boolean
}): SQLStatement {
  return buildSemanticRankingScore('t.bedrock_nova_multimodal_v1_embedding', signals)
}

// Escape LIKE metacharacters so they are treated as literals in prefix-match CASE expressions
export function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
