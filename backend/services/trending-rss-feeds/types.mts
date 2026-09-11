import type { PageInfo } from '@voucha/types/pagination'

export type TrendingRssFeedsOptions = {
  timeRange: 'day' | 'week' | 'month'
  minScore?: number
  limit: number
  after?: string
}

export type TrendingRssFeedMetric = {
  id: string
  trending_score: number
  follow_count: number
  item_count: number
}

export type TrendingRssFeedsResult = {
  results: TrendingRssFeedMetric[]
  page_info: PageInfo
}
