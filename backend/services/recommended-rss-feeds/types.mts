import type { PageInfo } from '@voucha/types/pagination'

export type RecommendationSource = 'friends' | 'topic' | 'collaborative' | 'all'

export type GetRecommendedRssFeedsOptions = {
  limit: number
  after?: string
  source?: RecommendationSource
}

export type RecommendedRssFeedResult = {
  id: string
  recommendation_score: number
  recommendation_reasons: string[]
}

export type GetRecommendedRssFeedsResult = {
  results: RecommendedRssFeedResult[]
  page_info: PageInfo
}
