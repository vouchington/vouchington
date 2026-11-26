/**
 * Pagination module types
 */

import type { PostType } from '@voucha/types/entities/post'
import type { TopicTypes } from '@voucha/types/entities/topic'
import type { TimeRange } from '@voucha/types/feed'
import type {
  NameCursor,
  PreciseTimestampCursor,
  RankingCursor,
  ScopedAliasCursor,
  ScopedPreciseTimestampCursor,
  ScopedScoreCursor,
  ScopedSimpleCursor,
  ScopedTierCursor,
  ScopedTierPreciseNameCursor,
  ScopedTierPreciseUuidCursor,
  ScopedTimestampCursor,
  ScoreCursor,
  SimpleCursor,
  TierCursor,
  TimestampCursor,
} from '@vouchington/pagination'
import type { MediaType } from './filters.mts'

export type Cursor =
  | SimpleCursor
  | ScopedSimpleCursor
  | ScoreCursor
  | ScopedScoreCursor
  | RankingCursor
  | TimestampCursor
  | ScopedTimestampCursor
  | PreciseTimestampCursor
  | ScopedPreciseTimestampCursor
  | ScopedTierPreciseNameCursor
  | ScopedTierPreciseUuidCursor
  | NameCursor
  | TierCursor
  | ScopedTierCursor
  | ScopedAliasCursor

/**
 * Cursor configuration types
 */
type CursorType =
  | 'simple'
  | 'score'
  | 'ranking'
  | 'timestamp'
  | 'precise_timestamp'
  | 'name'
  | 'tier'

/**
 * Cursor configuration
 *
 * NOTE: `type` is informational only - the parser does NOT validate cursor shape.
 * Services are responsible for decoding and validating cursor format using
 * type guards (isSimpleCursor, isTimestampCursor, etc.) from cursors.mts
 */
type CursorConfig = {
  type: CursorType | readonly CursorType[] // Informational only - documents expected cursor shape(s) but not validated by parser
  paramName?: string // Default: 'after'
}

/**
 * Limit configuration
 */
type LimitConfig = {
  min?: number // Default: 1
  max?: number // Default: 100
  default?: number // Default: 25
}

/**
 * Filter configuration
 */
export type FiltersConfig = {
  postTypes?: boolean
  topicTypes?: boolean
  timeRange?: boolean
  sort?: readonly string[]
  search?: boolean
  mediaTypes?: boolean
}

/**
 * Pagination parser configuration
 */
export type PaginationConfig = {
  cursor: CursorConfig
  limit?: LimitConfig
  filters?: FiltersConfig
}

/**
 * Base parsed options (always present)
 */
type BaseParsedOptions = {
  limit: number
  after?: string
}

/**
 * Filter options based on configuration
 */
type FilterOptions<TConfig extends FiltersConfig | undefined> = (TConfig extends undefined
  ? {}
  : {}) &
  (TConfig extends { postTypes: true } ? { post_types?: PostType[] } : {}) &
  (TConfig extends { topicTypes: true } ? { topic_types?: TopicTypes[] } : {}) &
  (TConfig extends { timeRange: true } ? { time_range?: TimeRange } : {}) &
  (TConfig extends { sort: readonly (infer T)[] } ? (T extends string ? { sort?: T } : {}) : {}) &
  (TConfig extends { search: true }
    ? { text_search_query?: string; semantic_search_query?: string }
    : {}) &
  (TConfig extends { mediaTypes: true } ? { media_types?: MediaType[] } : {})

/**
 * Parsed options type based on configuration
 */
export type ParsedOptions<TConfig extends PaginationConfig> = BaseParsedOptions &
  FilterOptions<TConfig['filters']>
