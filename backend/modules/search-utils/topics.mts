import type { TopicSearchOptions, TopicSearchSort } from '@voucha/types/entities/topic-search'

export function detectTopicSort(options: TopicSearchOptions): TopicSearchSort {
  const hasSearch =
    !!options.text_search_query?.trim() ||
    !!options.semantic_search_query?.trim() ||
    !!options.similar_post_id ||
    !!options.similar_topic_id ||
    !!options.similar_rss_feed_item_id
  return options.sort ?? (hasSearch ? 'relevance' : 'new')
}
