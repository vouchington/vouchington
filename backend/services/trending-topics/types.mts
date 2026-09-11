import type { PageInfo } from '@voucha/types/pagination'

export type TrendingTopicsTimeRange = 'day' | 'week' | 'month'

export type TrendingTopicsOptions = {
  timeRange: TrendingTopicsTimeRange
  minScore?: number
  limit: number
  after?: string
}

export type TrendingTopicMetric = {
  id: string
  trending_score: number
  post_tag_count: number
  rss_item_tag_count: number
}

export type TrendingTopicsResult = {
  results: TrendingTopicMetric[]
  page_info: PageInfo
}
