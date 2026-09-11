import type { PostSearchOptions, PostSearchSort } from '@voucha/types/entities/post-search'

export function hasTextSearch(options: PostSearchOptions): boolean {
  return !!(
    options.text_search_query &&
    typeof options.text_search_query === 'string' &&
    options.text_search_query.trim().length > 0
  )
}

export function hasSemanticSearch(options: PostSearchOptions): boolean {
  return !!(
    options.semantic_search_query &&
    typeof options.semantic_search_query === 'string' &&
    options.semantic_search_query.trim().length > 0
  )
}

export function hasSimilaritySearch(options: PostSearchOptions): boolean {
  return !!(options.similar_post_id || options.similar_topic_id || options.similar_rss_feed_item_id)
}

export function detectSearchSort(options: PostSearchOptions): PostSearchSort {
  const hasSearch =
    hasTextSearch(options) || hasSemanticSearch(options) || hasSimilaritySearch(options)
  return options.sort ?? (hasSearch ? 'relevance' : 'new')
}
