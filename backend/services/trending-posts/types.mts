import type { PageInfo } from '@voucha/types/pagination'
import type { TrendingPostType, TrendingTimeRange } from '@ts-shared/feed-capabilities'

export type TrendingPostsTimeRange = TrendingTimeRange

export type TrendingPostsPostType = TrendingPostType

export type TrendingPostsOptions = {
  timeRange: TrendingPostsTimeRange
  postType?: TrendingPostsPostType
  topicId?: string
  minScore?: number
  limit: number
  after?: string
}

export type TrendingPostMetric = {
  id: string
  trending_score: number
}

export type TrendingPostsResult = {
  results: TrendingPostMetric[]
  page_info: PageInfo
}
