import type { TopicTypes } from './topic.mts'
import type { PaginatedResult } from '../pagination.mts'

export type TopicSearchSort = 'new' | 'best' | 'relevance'

// Result type for topic search responses
export type TopicSearchResult = PaginatedResult<'topic'> & {
  name: string
  slug: string
  topic_type: string
}

type TopicSearchFilterOptions = {
  // Filter options
  text_search_query?: string // Full-text search
  semantic_search_query?: string // Embedding similarity search
  similar_post_id?: string // Find topics similar to a post via embeddings
  similar_topic_id?: string // Find similar topics via embeddings
  similar_rss_feed_item_id?: string // Find topics similar to an RSS feed item via embeddings
  slugs?: string[] // Filter by exact topic slugs
  topic_types?: TopicTypes[] // Filter by topic type
  spending_category?: boolean // Filter by spending category extension
  rss_feed?: boolean // Filter by RSS feed association
  fediverse_instance?: boolean // Filter by fediverse instance association
  fediverse_instance_software?: string // Filter by NodeInfo software (case-insensitive exact match)
  fediverse_instance_open_registrations?: boolean // Filter by open registrations flag
  fediverse_instance_integration_status?: 'pending' | 'approved' | 'blocked' // Filter by allowlist status
  hashtag_topic_ids?: string[] // Filter to specific topic IDs resolved from hashtag mentions

  // Sort option
  sort?: TopicSearchSort // Default: 'new'
}

// Base pagination options
type BasePaginationOptions = {
  limit?: number // Default 25, max 100
  omitLimit?: boolean // Skip LIMIT clause entirely
}

// Pagination for sort='new' (default)
type NewSortPagination = BasePaginationOptions & {
  sort?: 'new'
  after?: string // Base64-encoded cursor
}

// Pagination for sort='best'
type BestSortPagination = BasePaginationOptions & {
  sort: 'best'
  after?: string // Base64-encoded cursor
}

// Pagination for sort='relevance' (default when text search is active)
type RelevanceSortPagination = BasePaginationOptions & {
  sort?: 'relevance'
  after?: string // Base64-encoded cursor
}

type TopicSearchPaginationOptions = NewSortPagination | BestSortPagination | RelevanceSortPagination

type TopicSearchQueryOptions = {
  // Internal cursor parameters (decoded from 'after', used by query builder)
  id_lt?: string
  tier_after?: number // For relevance sort with text search: the tier from the last row's CASE expression
  ranking_lt?: number // For relevance sort with semantic-only search: the last row's ranking_score
  score_lt?: number // For sort=best: the last row's ratings__score__sort
  // Internal precomputed embedding for semantic_search_query
  semanticSearchEmbedding?: number[]
}

export type TopicSearchOptions = TopicSearchFilterOptions &
  TopicSearchPaginationOptions &
  TopicSearchQueryOptions
