import type { PageInfo } from '@voucha/types/pagination'

export type TrendingCommunityOptions = {
  limit: number
  after?: string
}

export type TrendingCommunity = {
  id: string
  trending_score: number
  member_count: number
  post_count: number
  virtual_subscription_count: number
}

export type TrendingCommunitiesResult = {
  communities: TrendingCommunity[]
  page_info: PageInfo
}
