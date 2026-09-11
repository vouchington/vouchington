import type { PostType } from './post.mts'
import type { PaginatedResult } from '../pagination.mts'
import type { TimeRange } from '../feed.mts'

export type PostSearchSort = 'new' | 'best' | 'hot' | 'relevance' | 'following_new'

// Result type for post search responses
export type PostSearchResult = PaginatedResult<'post'> & {
  post_type: string
}

type PostSearchFilterOptions = {
  // Filter options
  url_id?: string // Filter by related URL (with canonical chain)
  user_id?: string // Filter by post creator
  similar_post_id?: string // Find similar posts via embeddings
  similar_topic_id?: string // Find similar posts to topic via embeddings
  similar_rss_feed_item_id?: string // Find similar posts to an RSS feed item via embeddings
  related_topic_ids?: string[] // Filter by tagged/category topics (AND logic) — used by `categories=` param
  hashtag_topic_ids?: string[] // Linked hashtag topic filters (AND logic)
  hashtag_alias_ids?: string[] // Exact unlinked hashtag filters (AND logic)
  universal_topic_ids?: string[] // Filter by any topic relationship: tagged OR reviewed OR data-pointed (OR logic per topic, AND across topics)
  review_topic_ids?: string[] // Filter reviews for specific topics (AND logic)
  data_point_topic_ids?: string[] // Filter data points for specific topics (AND logic)
  text_search_query?: string // Full-text search
  semantic_search_query?: string // Embedding similarity search
  post_types?: PostType[] // Filter by post type
  data_point_vertical?: string // Filter data_point posts by vertical (e.g. 'credit_card', 'bank_account')
  story_id?: string // Filter posts linked to a specific story
  include_topic_recommendations?: boolean // Internal opt-in for dedicated recommendation flows
  drafts?: boolean // Show unpublished posts
  time_range?: TimeRange // Time range filter (default: '1w' for feeds, 'all' for search)
  exclude_for_user_id?: string // Exclude muted/blocked hostnames, topics, and users for this user

  // Sort option
  sort?: PostSearchSort // Default: 'new' or 'relevance' if searching
}

// Base pagination options shared across all sort modes
type BasePaginationOptions = {
  limit?: number // Default 25, max 100
  omitLimit?: boolean // Skip LIMIT clause entirely (for facets)
  omitOrderBy?: boolean // Skip ORDER BY clause (for count queries)
}

// Pagination for sort='new' (default when not searching)
type NewSortPagination = BasePaginationOptions & {
  sort?: 'new'
  after?: string // Base64-encoded cursor
  vote_score_lt?: never
  ranking_lt?: never
}

type FollowingNewSortPagination = BasePaginationOptions & {
  sort: 'following_new'
  after?: string // Base64-encoded cursor
  vote_score_lt?: never
}

// Pagination for sort='best'
type BestSortPagination = BasePaginationOptions & {
  sort: 'best'
  after?: string // Base64-encoded cursor
  ranking_lt?: never
}

// Pagination for sort='hot'
type HotSortPagination = BasePaginationOptions & {
  sort: 'hot'
  after?: string
  vote_score_lt?: never
  ranking_lt?: never
}

// Pagination for sort='relevance' (default when searching)
type RelevanceSortPagination = BasePaginationOptions & {
  sort?: 'relevance'
  after?: string // Base64-encoded cursor
  vote_score_lt?: never
}

type PostSearchPaginationOptions =
  | NewSortPagination
  | FollowingNewSortPagination
  | BestSortPagination
  | HotSortPagination
  | RelevanceSortPagination

type PostSearchQueryOptions = {
  // Pre-computed embedding for semantic search (computed before SQL)
  semanticSearchEmbedding?: number[]
  // Internal cursor parameters (decoded from 'after', used by query builder)
  id_lt?: string
  vote_score_lt?: number
  ranking_lt?: number
  hot_score_lt?: number
}

export type PostSearchOptions = PostSearchFilterOptions &
  PostSearchPaginationOptions &
  PostSearchQueryOptions
