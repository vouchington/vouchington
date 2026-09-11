import type * as Api from './shared'
import type { PaginatedResponse, PaginatedResult } from './pagination-and-entities'

type Topic = Api.Topic
type TopicMetrics = Api.TopicMetrics

export type RecommendedTopicResult = PaginatedResult<'topic'> & {
  score: number
  reason: string
}

export type RecommendedTopicsResponseBody = PaginatedResponse<RecommendedTopicResult> & {
  topics: Record<string, Topic>
  topics_metrics: Record<string, TopicMetrics>
}
