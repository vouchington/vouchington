import type { TopicSearchOptions, TopicSearchSort } from './types.mts'

export type TopicSemanticAnchorCte =
  | 'semantic_search_embedding'
  | 'similar_topic_embedding'
  | 'similar_post_embedding'
  | 'similar_rss_feed_item_embedding'

export type TopicSearchState = ReturnType<typeof getTopicSearchState>

export function getTopicSearchState(options: TopicSearchOptions, sort: TopicSearchSort) {
  const hasTextSearch = Boolean(options.text_search_query?.trim())
  const hasSemanticSearch =
    Boolean(options.semantic_search_query?.trim()) && options.semanticSearchEmbedding !== undefined
  const hasSimilarPostSearch = Boolean(options.similar_post_id)
  const hasSimilarTopicSearch = Boolean(options.similar_topic_id)
  const hasSimilarRssFeedItemSearch = Boolean(options.similar_rss_feed_item_id)
  const activeSemanticCtes: TopicSemanticAnchorCte[] = [
    ...(hasSemanticSearch ? (['semantic_search_embedding'] as const) : []),
    ...(hasSimilarTopicSearch ? (['similar_topic_embedding'] as const) : []),
    ...(hasSimilarPostSearch ? (['similar_post_embedding'] as const) : []),
    ...(hasSimilarRssFeedItemSearch ? (['similar_rss_feed_item_embedding'] as const) : []),
  ]
  const semanticAnchorCte: TopicSemanticAnchorCte | null = activeSemanticCtes.at(0) ?? null
  const secondarySemanticCtes = activeSemanticCtes.slice(1)
  const hasSemanticSignal = semanticAnchorCte !== null

  return {
    hasSemanticSearch,
    hasSemanticSignal,
    hasSecondarySemanticSignal: secondarySemanticCtes.length > 0,
    hasSimilarPostSearch,
    hasSimilarRssFeedItemSearch,
    hasSimilarTopicSearch,
    hasTextSearch,
    secondarySemanticCtes,
    semanticAnchorCte,
    useSemanticRelevanceRanking: sort === 'relevance' && !hasTextSearch && hasSemanticSignal,
  }
}
