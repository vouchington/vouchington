import { type SQLStatement } from 'sql-template-strings'
import { buildSemanticRankingScore } from '@modules/search-utils'

export function buildRssFeedItemRelevanceScoreExpression(options: {
  hasSemanticSearch: boolean
  hasSimilarPostSearch: boolean
  hasSimilarTopicSearch: boolean
  hasSimilarRssFeedItemSearch: boolean
}): SQLStatement {
  return buildSemanticRankingScore('rss_feed_items.bedrock_nova_multimodal_v1_embedding', options)
}
