import type { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'

type SearchRssFeedItemsDependencies = {
  getCachedSearchEmbedding: typeof getCachedSearchEmbedding
}

export type SearchRssFeedItemsOptions = {
  rss_feed_ids?: string[]
  topic_ids?: string[]
  category_topic_ids?: string[]
  hashtag_topic_ids?: string[]
  hashtag_alias_ids?: string[]
  story_id?: string
  limit?: number
  after?: string
  has_related_posts?: boolean
  media_types?: Array<'article' | 'audio' | 'video'>
  text_search_query?: string
  /** When set, returns embedding-ranked results instead of recency ordering. */
  semantic_search_query?: string
  /** Filter by read state. Requires currentUserId. */
  read?: boolean
  /** Used with `read` to filter by the current user's read states. */
  currentUserId?: string
  /** Internal viewer role flag for post-relationship discovery. */
  isAdministrator?: boolean
  dependencies?: Partial<SearchRssFeedItemsDependencies>
}
