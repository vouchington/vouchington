import type { PaginatedResult } from '@voucha/types/pagination'
import type { TopicTypes } from '@services/topics'

export type RecommendedTopicResult = PaginatedResult<'topic'> & {
  score: number // Recommendation score/weight
  reason: string // Why this topic was recommended
}

export type RecommendedTopicsOptions = {
  limit?: number // Default 25, max 100
  after?: string // Base64-encoded cursor { score: number, id: string }

  // Filter options
  topic_types?: TopicTypes[]
  spending_category?: boolean
  rss_feed?: boolean

  // Sort option
  sort?: 'score' | 'best' // 'score' = weighted DESC (default), 'best' = name ASC
}

type RecommendedTopicsQueryOptions = {
  score_lt?: number // Decoded score from cursor
  id_gt?: string // Decoded id from cursor
}

export type RecommendedTopicsSearchOptions = RecommendedTopicsOptions &
  RecommendedTopicsQueryOptions
