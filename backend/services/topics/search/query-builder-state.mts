import type { TopicSearchOptions, TopicSearchSort } from './types.mts'

export type TopicSearchState = ReturnType<typeof getTopicSearchState>

export function getTopicSearchState(options: TopicSearchOptions, sort: TopicSearchSort) {
  const hasTextSearch = Boolean(options.text_search_query?.trim())
  const hasSemanticSearch =
    Boolean(options.semantic_search_query?.trim()) && options.semanticSearchEmbedding !== undefined
  const hasSimilarPostSearch = Boolean(options.similar_post_id)
  const hasSimilarTopicSearch = Boolean(options.similar_topic_id)
  const hasSimilarRssFeedItemSearch = Boolean(options.similar_rss_feed_item_id)
  const hasSemanticSignal =
    hasSemanticSearch ||
    hasSimilarPostSearch ||
    hasSimilarTopicSearch ||
    hasSimilarRssFeedItemSearch

  return {
    hasSemanticSearch,
    hasSemanticSignal,
    hasSimilarPostSearch,
    hasSimilarRssFeedItemSearch,
    hasSimilarTopicSearch,
    hasTextSearch,
    useSemanticRelevanceRanking: sort === 'relevance' && !hasTextSearch && hasSemanticSignal,
  }
}
